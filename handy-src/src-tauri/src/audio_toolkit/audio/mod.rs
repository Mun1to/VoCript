// Re-export all audio components
mod device;
#[cfg(windows)]
mod process_loopback;
mod recorder;
mod resampler;
mod utils;
mod visualizer;

pub use device::{list_input_devices, list_output_devices, CpalDeviceInfo};
#[cfg(windows)]
pub use process_loopback::{find_pid_by_name, list_audio_apps, AudioApp};
pub use recorder::{is_microphone_access_denied, is_no_input_device_error, AudioRecorder};
pub use resampler::FrameResampler;
pub use utils::{read_wav_samples, save_wav_file, verify_wav_file};
pub use visualizer::AudioVisualiser;
