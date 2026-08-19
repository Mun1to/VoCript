fn main() {
    #[cfg(all(target_os = "macos", target_arch = "aarch64"))]
    build_apple_intelligence_bridge();

    generate_tray_translations();

    // Linux ships transcribe-cpp as a shared libtranscribe plus loadable ggml
    // backend modules (the `dynamic-backends` posture in Cargo.toml). Bake an
    // $ORIGIN-relative rpath into the binary so it finds libtranscribe next to
    // it in the package: deb/rpm install into the app-private
    // `/usr/lib/VoCript` — the dir tauri already uses for resources, which
    // keeps our libraries out of the ldconfig-scanned `/usr/lib` — while the
    // AppImage keeps them in `usr/lib` (linuxdeploy's layout), hence both
    // entries. init_backends_default() then loads the ggml modules co-located
    // there.
    //
    // Windows resolves DLLs from the executable's directory and needs no
    // rpath; macOS links transcribe-cpp statically via the `metal` feature.
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("linux") {
        println!("cargo:rustc-link-arg=-Wl,-rpath,$ORIGIN/../lib/VoCript:$ORIGIN/../lib");
    }

    // Stage transcribe-cpp's shared runtime libraries (and the dlopen'd ggml
    // backend modules) so the installer can ship them. Self-gates on the
    // shared / dynamic-backends posture used by Windows and Linux; a no-op for
    // the static macOS `metal` build, where there is nothing to ship.
    stage_transcribe_runtime_libs();

    // Those DLLs import the dynamic MSVC runtime, which is not part of a clean
    // Windows. Ship it next to them.
    stage_msvc_runtime_dlls();

    tauri_build::build()
}

/// Stage transcribe-cpp's shared runtime libraries into `transcribe-libs/` so
/// the installer can ship them next to the executable. One code path covers
/// Windows (`.dll`) and Linux (versioned `.so`); the match-by-name filter below
/// handles both naming schemes.
///
/// Source dirs arrive as `DEP_TRANSCRIBE_CPP_*`: the sys crate
/// (`links = "transcribe"`) emits its install dirs and the wrapper
/// (`links = "transcribe_cpp"`) forwards them one hop to us — the only way that
/// metadata crosses cargo's one-hop `links` boundary. The keys exist only in a
/// shared / dynamic-backends build; a static build (macOS `metal`) leaves them
/// unset, so this is a no-op there.
///
/// Where the staged dir lands: Windows bundles it beside `vocript.exe` (DLLs
/// resolve from the exe dir); Linux deb/rpm map it into the app-private
/// `/usr/lib/VoCript` and the AppImage into `usr/lib`, both on the rpath baked
/// in above.
fn stage_transcribe_runtime_libs() {
    use std::collections::{BTreeMap, BTreeSet};
    use std::path::PathBuf;

    println!("cargo:rerun-if-env-changed=DEP_TRANSCRIBE_CPP_RUNTIME_DIR");
    println!("cargo:rerun-if-env-changed=DEP_TRANSCRIBE_CPP_MODULE_DIR");

    // Present only in a shared posture. A static build has nothing to ship —
    // but on Windows and Linux the shared posture is exactly what Cargo.toml
    // selects, so a missing variable there means the staging silently produced
    // nothing and the installer would ship without transcribe.dll. That is the
    // precise failure that shipped a broken v3.5.5 and stopped the app from
    // starting at all, so fail the build loudly instead of trusting silence.
    let Some(runtime_dir) = std::env::var_os("DEP_TRANSCRIBE_CPP_RUNTIME_DIR") else {
        let target_os = std::env::var("CARGO_CFG_TARGET_OS").unwrap_or_default();
        if matches!(target_os.as_str(), "windows" | "linux") {
            panic!(
                "DEP_TRANSCRIBE_CPP_RUNTIME_DIR is unset while building for {target_os}, where \
                 transcribe-cpp is used in its dynamic-backends posture. Nothing would be staged \
                 into transcribe-libs/ and the installer would ship without transcribe.dll. \
                 Check the transcribe-cpp features in Cargo.toml."
            );
        }
        return;
    };

    // transcribe-cpp publishes its runtime layout in up to two directories:
    //   RUNTIME_DIR : the shared libs to load (transcribe + core ggml/ggml-base)
    //   MODULE_DIR  : the dlopen'd ggml backend modules (the per-ISA ggml-cpu-*
    //                 and ggml-vulkan), dynamic-backends only. Often — but not
    //                 always — the SAME directory as RUNTIME_DIR.
    // BOTH must sit next to the executable, or init_backends_default() finds
    // the core libs but zero loadable compute backends and registers no
    // devices, which fails every model load including plain CPU.
    let mut dirs = BTreeSet::new();
    dirs.insert(PathBuf::from(runtime_dir));
    if let Some(module_dir) = std::env::var_os("DEP_TRANSCRIBE_CPP_MODULE_DIR") {
        dirs.insert(PathBuf::from(module_dir));
    }

    let dest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("transcribe-libs");
    // Recreate clean so a renamed or dropped ggml module can never linger in
    // the package from a previous build.
    let _ = std::fs::remove_dir_all(&dest);
    std::fs::create_dir_all(&dest).expect("create transcribe-libs staging dir");

    // Collect every candidate library name first (across both dirs) so the
    // pruning below can see each lib's whole symlink family at once.
    let mut libs: BTreeMap<String, PathBuf> = BTreeMap::new();
    for dir in &dirs {
        println!("cargo:rerun-if-changed={}", dir.display());
        for entry in std::fs::read_dir(dir)
            .unwrap_or_else(|e| panic!("read {}: {e}", dir.display()))
            .flatten()
        {
            let src = entry.path();
            let name = src.file_name().and_then(|s| s.to_str()).unwrap_or("");
            // Match by NAME, not extension: Linux versions its libs
            // (libtranscribe.so.0, .so.0.1.3) and the loader needs the SONAME,
            // so an extension-only filter would miss the versioned names.
            let is_lib = name.ends_with(".dll")
                || name.ends_with(".dylib")
                || name.ends_with(".so")
                || name.contains(".so.");
            if is_lib {
                libs.insert(name.to_string(), src);
            }
        }
    }

    // A Linux install dir carries each lib as a symlink chain (libfoo.so ->
    // libfoo.so.0 -> libfoo.so.0.1.3), and tauri's deb/rpm bundlers flatten
    // symlinks into real files — staging every name would triplicate each lib
    // on disk and draw "not a symbolic link" warnings from ldconfig. Only one
    // name per lib is ever resolved at runtime: the SONAME (`libfoo.so.N`) for
    // the NEEDED core libs, and the bare unversioned name for the dlopen'd ggml
    // modules. Stage exactly that name; `fs::copy` dereferences the symlink so
    // the staged file is the real library.
    let mut best: BTreeMap<&str, (&str, &PathBuf, usize)> = BTreeMap::new();
    for (name, src) in &libs {
        let (stem, rank) = match split_versioned_so(name) {
            // Windows/macOS names (.dll/.dylib) are unversioned: keep as-is.
            None => (name.as_str(), 0),
            // Prefer the SONAME form (exactly one numeric suffix), then the
            // bare `.so`; fully-versioned names only as a last resort.
            Some((stem, depth)) => (stem, if depth == 1 { 0 } else { depth + 1 }),
        };
        match best.get(stem) {
            Some(&(_, _, existing)) if existing <= rank => {}
            _ => {
                best.insert(stem, (name, src, rank));
            }
        }
    }

    let mut copied = 0usize;
    for &(name, src, _) in best.values() {
        std::fs::copy(src, dest.join(name))
            .unwrap_or_else(|e| panic!("copy {}: {e}", src.display()));
        copied += 1;
    }
    if copied == 0 {
        panic!(
            "no transcribe-cpp runtime libraries found under {dirs:?}; a shared / \
             dynamic-backends build must ship them or the app registers zero \
             compute devices and every model load fails"
        );
    }
    println!("cargo:warning=Staged {copied} transcribe-cpp runtime library file(s)");
}

/// Split a versioned ELF shared-library name into (stem, version depth):
/// `libfoo.so` -> ("libfoo", 0), `libfoo.so.0` -> ("libfoo", 1),
/// `libfoo.so.0.1.3` -> ("libfoo", 3). Returns None for names that aren't a
/// `.so` optionally followed by dot-separated numeric components.
fn split_versioned_so(name: &str) -> Option<(&str, usize)> {
    let idx = name.find(".so")?;
    let (stem, rest) = (&name[..idx], &name[idx + 3..]);
    if rest.is_empty() {
        return Some((stem, 0));
    }
    let comps: Vec<&str> = rest.strip_prefix('.')?.split('.').collect();
    comps
        .iter()
        .all(|c| !c.is_empty() && c.bytes().all(|b| b.is_ascii_digit()))
        .then_some((stem, comps.len()))
}

/// Windows only: stage the MSVC runtime DLLs next to the transcribe-cpp ones.
///
/// Every `transcribe.dll` / `ggml*.dll` staged above imports `MSVCP140.dll` and
/// the two `VCRUNTIME140` ones, and `vocript.exe` itself also imports
/// `MSVCP140_1.dll`. Those ship in the Visual C++ Redistributable, which
/// a clean Windows does NOT have, so the installed app died at startup with
/// "The code execution cannot proceed because MSVCP140.dll was not found"
/// before drawing a single window. Store certification caught it on a stock
/// Surface (policy 10.2.4.1 "undisclosed dependency"), and the plain NSIS
/// installer carried the same hole since the transcribe-cpp engine landed in
/// v3.5.5 — it only ever worked because most machines already have the
/// redistributable from some other program.
///
/// App-local deployment is the supported fix: the loader searches the
/// executable's own directory before the system one, so a copy sitting beside
/// the exe wins and nothing has to be installed alongside. Redistributing
/// these files is covered by the Visual Studio distributable-code terms.
fn stage_msvc_runtime_dlls() {
    use std::path::PathBuf;

    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }

    // The whole CRT directory, not a hand-picked list. A curated list was tried
    // first and was already wrong: `dumpbin` on the native libraries named three
    // DLLs, and the running process then pulled a fourth (`MSVCP140_1.dll`, from
    // the exe's own imports) out of System32, which is exactly the copy a clean
    // machine does not have. Import tables also miss anything loaded at runtime.
    // The whole set is ~1.7 MB in a 47 MB package, far less than another round
    // of certification.
    //
    // Sanity anchors: if these two are missing, the directory found is not a CRT.
    const ANCHORS: &[&str] = &["msvcp140.dll", "vcruntime140.dll"];

    println!("cargo:rerun-if-env-changed=VOCRIPT_ALLOW_MISSING_MSVC_RUNTIME");
    let allow_missing = std::env::var_os("VOCRIPT_ALLOW_MISSING_MSVC_RUNTIME").is_some();

    let arch = match std::env::var("CARGO_CFG_TARGET_ARCH").as_deref() {
        Ok("aarch64") => "arm64",
        _ => "x64",
    };

    let Some(crt_dir) = find_msvc_redist_dir(arch) else {
        // A missing runtime only becomes a broken package when that package is
        // the one users install, so a release build stops here and a dev build
        // just says so: the developer's own machine has the redistributable.
        let msg = format!(
            "cannot find the Visual C++ redistributable DLLs for {arch} (looked at \
             VCToolsRedistDir and at the install vswhere reports). Without them the \
             packaged app dies at startup with \"MSVCP140.dll was not found\" on any \
             Windows that does not already carry the redistributable."
        );
        if std::env::var("PROFILE").as_deref() == Ok("release") && !allow_missing {
            panic!(
                "{msg} Install the \"MSVC v143 build tools\" component of Visual Studio, \
                 or set VOCRIPT_ALLOW_MISSING_MSVC_RUNTIME=1 to build a package that only \
                 runs where the redistributable is already present."
            );
        }
        println!("cargo:warning={msg}");
        return;
    };

    println!("cargo:rerun-if-changed={}", crt_dir.display());
    let dest = PathBuf::from(std::env::var("CARGO_MANIFEST_DIR").unwrap()).join("transcribe-libs");
    std::fs::create_dir_all(&dest).expect("create transcribe-libs staging dir");
    let mut staged: Vec<String> = Vec::new();
    for entry in std::fs::read_dir(&crt_dir)
        .unwrap_or_else(|e| panic!("read {}: {e}", crt_dir.display()))
        .flatten()
    {
        let src = entry.path();
        let Some(name) = src.file_name().and_then(|n| n.to_str()) else {
            continue;
        };
        if !name.to_ascii_lowercase().ends_with(".dll") {
            continue;
        }
        std::fs::copy(&src, dest.join(name))
            .unwrap_or_else(|e| panic!("copy {}: {e}", src.display()));
        staged.push(name.to_ascii_lowercase());
    }
    for anchor in ANCHORS {
        assert!(
            staged.iter().any(|s| s == anchor),
            "{} holds no {anchor}, so it is not the Visual C++ CRT directory it              looked like; the package would ship without the runtime",
            crt_dir.display()
        );
    }
    println!(
        "cargo:warning=Staged {} MSVC runtime DLL(s) from {}",
        staged.len(),
        crt_dir.display()
    );
}

/// Locate the `Microsoft.VC<toolset>.CRT` directory of the newest Visual C++
/// redistributable on this machine, for the given architecture directory name
/// (`x64` / `arm64`).
fn find_msvc_redist_dir(arch: &str) -> Option<std::path::PathBuf> {
    use std::path::{Path, PathBuf};

    // A developer command prompt exports the redist root directly.
    if let Some(dir) = std::env::var_os("VCToolsRedistDir") {
        if let Some(found) = msvc_crt_subdir(&PathBuf::from(dir).join(arch)) {
            return Some(found);
        }
    }

    // Otherwise ask vswhere, which every Visual Studio since 2017 installs at a
    // fixed path regardless of where VS itself went.
    let program_files = std::env::var("ProgramFiles(x86)")
        .unwrap_or_else(|_| r"C:\Program Files (x86)".to_string());
    let vswhere = Path::new(&program_files).join(r"Microsoft Visual Studio\Installer\vswhere.exe");
    let output = std::process::Command::new(vswhere)
        .args([
            "-latest",
            "-products",
            "*",
            "-property",
            "installationPath",
            "-utf8",
        ])
        .output()
        .ok()?;
    let install = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if install.is_empty() {
        return None;
    }
    let redist_root = Path::new(&install).join(r"VC\Redist\MSVC");

    // VS names a default redist version in a text file, but that file and the
    // directories on disk drift apart after some updates, so the highest
    // version actually present is kept as a fallback.
    let mut candidates: Vec<PathBuf> = Vec::new();
    let default_version =
        Path::new(&install).join(r"VC\Auxiliary\Build\Microsoft.VCRedistVersion.default.txt");
    if let Ok(version) = std::fs::read_to_string(&default_version) {
        candidates.push(redist_root.join(version.trim()));
    }
    if let Ok(entries) = std::fs::read_dir(&redist_root) {
        let mut versions: Vec<PathBuf> = entries
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.is_dir())
            .collect();
        versions.sort();
        candidates.extend(versions.into_iter().rev());
    }
    candidates
        .into_iter()
        .find_map(|c| msvc_crt_subdir(&c.join(arch)))
}

/// The CRT sits in a toolset-stamped subdirectory (`Microsoft.VC143.CRT` today,
/// a higher number after the next toolset), so match the shape of the name
/// rather than hardcoding the number, and take the highest one present.
fn msvc_crt_subdir(arch_dir: &std::path::Path) -> Option<std::path::PathBuf> {
    let mut hits: Vec<std::path::PathBuf> = std::fs::read_dir(arch_dir)
        .ok()?
        .flatten()
        .map(|e| e.path())
        .filter(|p| {
            p.is_dir()
                && p.file_name()
                    .and_then(|n| n.to_str())
                    .is_some_and(|n| n.starts_with("Microsoft.VC") && n.ends_with(".CRT"))
        })
        .collect();
    hits.sort();
    hits.pop()
}

/// Generate tray menu translations from frontend locale files.
///
/// Source of truth: src/i18n/locales/*/translation.json
/// The English "tray" section defines the struct fields.
fn generate_tray_translations() {
    use std::collections::BTreeMap;
    use std::fs;
    use std::path::Path;

    let out_dir = std::env::var("OUT_DIR").unwrap();
    let locales_dir = Path::new("../src/i18n/locales");

    println!("cargo:rerun-if-changed=../src/i18n/locales");

    // Collect all locale translations
    let mut translations: BTreeMap<String, serde_json::Value> = BTreeMap::new();

    for entry in fs::read_dir(locales_dir).unwrap().flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }

        let lang = path.file_name().unwrap().to_str().unwrap().to_string();
        let json_path = path.join("translation.json");

        println!("cargo:rerun-if-changed={}", json_path.display());

        let content = fs::read_to_string(&json_path).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&content).unwrap();

        if let Some(tray) = parsed.get("tray").cloned() {
            translations.insert(lang, tray);
        }
    }

    // English defines the schema
    let english = translations.get("en").unwrap().as_object().unwrap();
    let fields: Vec<_> = english
        .keys()
        .map(|k| (camel_to_snake(k), k.clone()))
        .collect();

    // Generate code
    let mut out = String::from(
        "// Auto-generated from src/i18n/locales/*/translation.json - do not edit\n\n",
    );

    // Struct
    out.push_str("#[derive(Debug, Clone)]\npub struct TrayStrings {\n");
    for (rust_field, _) in &fields {
        out.push_str(&format!("    pub {rust_field}: String,\n"));
    }
    out.push_str("}\n\n");

    // Static map
    out.push_str(
        "pub static TRANSLATIONS: Lazy<HashMap<&'static str, TrayStrings>> = Lazy::new(|| {\n",
    );
    out.push_str("    let mut m = HashMap::new();\n");

    for (lang, tray) in &translations {
        out.push_str(&format!("    m.insert(\"{lang}\", TrayStrings {{\n"));
        for (rust_field, json_key) in &fields {
            let val = tray.get(json_key).and_then(|v| v.as_str()).unwrap_or("");
            out.push_str(&format!(
                "        {rust_field}: \"{}\".to_string(),\n",
                escape_string(val)
            ));
        }
        out.push_str("    });\n");
    }

    out.push_str("    m\n});\n");

    fs::write(Path::new(&out_dir).join("tray_translations.rs"), out).unwrap();

    println!(
        "cargo:warning=Generated tray translations: {} languages, {} fields",
        translations.len(),
        fields.len()
    );
}

fn camel_to_snake(s: &str) -> String {
    s.chars()
        .enumerate()
        .fold(String::new(), |mut acc, (i, c)| {
            if c.is_uppercase() && i > 0 {
                acc.push('_');
            }
            acc.push(c.to_lowercase().next().unwrap());
            acc
        })
}

fn escape_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

#[cfg(all(target_os = "macos", target_arch = "aarch64"))]
fn build_apple_intelligence_bridge() {
    use std::env;
    use std::path::{Path, PathBuf};
    use std::process::Command;

    const REAL_SWIFT_FILE: &str = "swift/apple_intelligence.swift";
    const STUB_SWIFT_FILE: &str = "swift/apple_intelligence_stub.swift";
    const BRIDGE_HEADER: &str = "swift/apple_intelligence_bridge.h";

    println!("cargo:rerun-if-changed={REAL_SWIFT_FILE}");
    println!("cargo:rerun-if-changed={STUB_SWIFT_FILE}");
    println!("cargo:rerun-if-changed={BRIDGE_HEADER}");

    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR not set"));
    let object_path = out_dir.join("apple_intelligence.o");
    let static_lib_path = out_dir.join("libapple_intelligence.a");

    // SDKROOT/SWIFTC env-var overrides let non-Xcode toolchains (e.g. nixpkgs
    // with apple-sdk_* + standalone swift) bypass xcrun, which is Xcode-only.
    let sdk_path = env::var("SDKROOT").unwrap_or_else(|_| {
        String::from_utf8(
            Command::new("xcrun")
                .args(["--sdk", "macosx", "--show-sdk-path"])
                .output()
                .expect("Failed to locate macOS SDK")
                .stdout,
        )
        .expect("SDK path is not valid UTF-8")
        .trim()
        .to_string()
    });

    // Check if the SDK supports FoundationModels (required for Apple Intelligence)
    let framework_path =
        Path::new(&sdk_path).join("System/Library/Frameworks/FoundationModels.framework");
    let has_foundation_models = framework_path.exists();

    let source_file = if has_foundation_models {
        println!("cargo:warning=Building with Apple Intelligence support.");
        REAL_SWIFT_FILE
    } else {
        println!("cargo:warning=Apple Intelligence SDK not found. Building with stubs.");
        STUB_SWIFT_FILE
    };

    if !Path::new(source_file).exists() {
        panic!("Source file {} is missing!", source_file);
    }

    // See SDKROOT note above — same env-override pattern for non-Xcode toolchains.
    let swiftc_path = env::var("SWIFTC").unwrap_or_else(|_| {
        String::from_utf8(
            Command::new("xcrun")
                .args(["--find", "swiftc"])
                .output()
                .expect("Failed to locate swiftc")
                .stdout,
        )
        .expect("swiftc path is not valid UTF-8")
        .trim()
        .to_string()
    });

    let toolchain_swift_lib = Path::new(&swiftc_path)
        .parent()
        .and_then(|p| p.parent())
        .map(|root| root.join("lib/swift/macosx"))
        .expect("Unable to determine Swift toolchain lib directory");
    let sdk_swift_lib = Path::new(&sdk_path).join("usr/lib/swift");

    // Use macOS 11.0 as deployment target for compatibility
    // The @available(macOS 26.0, *) checks in Swift handle runtime availability
    // Weak linking for FoundationModels is handled via cargo:rustc-link-arg below
    let status = Command::new(&swiftc_path)
        .args([
            // Without this flag swiftc treats single-file input as script
            // mode and emits its own `_main` symbol into the .o, which can
            // win the link against Rust's main under some linkers (e.g.
            // open-source ld64 used in nixpkgs' Darwin stdenv), producing a
            // binary whose main() is a 5-instruction no-op that returns 0.
            // `-parse-as-library` keeps the compilation in library mode so
            // no `_main` is emitted. See:
            //   https://forums.swift.org/t/main-in-a-single-swift-file/63079
            "-parse-as-library",
            "-target",
            "arm64-apple-macosx11.0",
            "-sdk",
            &sdk_path,
            "-O",
            "-import-objc-header",
            BRIDGE_HEADER,
            "-c",
            source_file,
            "-o",
            object_path
                .to_str()
                .expect("Failed to convert object path to string"),
        ])
        .status()
        .expect("Failed to invoke swiftc for Apple Intelligence bridge");

    if !status.success() {
        panic!("swiftc failed to compile {source_file}");
    }

    let status = Command::new("libtool")
        .args([
            "-static",
            "-o",
            static_lib_path
                .to_str()
                .expect("Failed to convert static lib path to string"),
            object_path
                .to_str()
                .expect("Failed to convert object path to string"),
        ])
        .status()
        .expect("Failed to create static library for Apple Intelligence bridge");

    if !status.success() {
        panic!("libtool failed for Apple Intelligence bridge");
    }

    println!("cargo:rustc-link-search=native={}", out_dir.display());
    println!("cargo:rustc-link-lib=static=apple_intelligence");
    println!(
        "cargo:rustc-link-search=native={}",
        toolchain_swift_lib.display()
    );
    println!("cargo:rustc-link-search=native={}", sdk_swift_lib.display());
    println!("cargo:rustc-link-lib=framework=Foundation");

    if has_foundation_models {
        // Use weak linking so the app can launch on systems without FoundationModels
        println!("cargo:rustc-link-arg=-weak_framework");
        println!("cargo:rustc-link-arg=FoundationModels");
    }

    println!("cargo:rustc-link-arg=-Wl,-rpath,/usr/lib/swift");
}
