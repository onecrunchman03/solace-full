// SOLACE SURVIVORZ — THE STREAM RIG'S EARS (scripts/survivorz/streamer.mjs).
//
//   proc-audio <pid>    one process tree's audio, as raw PCM on stdout: s16le, 48 kHz, stereo
//
// Windows' process loopback (WASAPI, Windows 10 2004+) hands over exactly what one program — and its
// children — plays, and nothing else: the rig's Edge, never the desktop's other sounds (Discord, a game, a
// notification). The rig gives it the browser's root process; Chromium plays through a child process,
// which the tree includes.
//
// The output never stalls: when the program is quiet Windows sends no packets at all, so silence is
// written to keep the stream at real time — ffmpeg stamps the audio by the wall clock as it arrives, and
// a stream that stops would read as a gap. A failure (the process gone, the pipe closed) exits non-zero.
use std::io::{self, Write};
use std::time::{Duration, Instant};
use wasapi::*;

const RATE: u64 = 48_000;
const CH: usize = 2;

fn main() {
    let pid: u32 = match std::env::args().nth(1).and_then(|a| a.parse().ok()) {
        Some(p) => p,
        None => { eprintln!("usage: proc-audio <pid>"); std::process::exit(2); }
    };
    if let Err(e) = run(pid) {
        eprintln!("proc-audio: {e}");
        std::process::exit(1);
    }
}

fn run(pid: u32) -> Result<(), Box<dyn std::error::Error>> {
    initialize_mta().ok()?;
    let format = WaveFormat::new(32, 32, &SampleType::Float, RATE as usize, CH, None);
    let block = format.get_blockalign() as usize;
    let mut client = AudioClient::new_application_loopback_client(pid, true)?;
    client.initialize_client(&format, &Direction::Capture, &StreamMode::EventsShared { autoconvert: true, buffer_duration_hns: 0 })?;
    let event = client.set_get_eventhandle()?;
    let capture = client.get_audiocaptureclient()?;
    client.start_stream()?;
    eprintln!("proc-audio: capturing process {pid} (and its children) at {RATE} Hz");

    let mut out = io::stdout().lock();
    let start = Instant::now();
    let mut frames_out: u64 = 0;
    let mut last_data = Instant::now();
    let mut buf: Vec<u8> = Vec::new();
    let mut pcm: Vec<u8> = Vec::new();
    loop {
        // a quiet program sends no events: wake every 10 ms either way
        let _ = event.wait_for_event(10);
        let mut got = false;
        while let Some(n) = capture.get_next_packet_size()? {
            if n == 0 { break; }
            buf.resize(n as usize * block, 0);
            let (frames, info) = capture.read_from_device(&mut buf)?;
            let frames = frames as usize;
            pcm.clear();
            pcm.reserve(frames * CH * 2);
            for i in 0..frames * CH {
                let v = if info.flags.silent { 0.0 } else { f32::from_le_bytes(buf[i * 4..i * 4 + 4].try_into().unwrap()) };
                let s = (v.clamp(-1.0, 1.0) * 32767.0).round() as i16;
                pcm.extend_from_slice(&s.to_le_bytes());
            }
            out.write_all(&pcm)?;
            frames_out += frames as u64;
            got = true;
        }
        if got {
            last_data = Instant::now();
        } else if last_data.elapsed() > Duration::from_millis(40) {
            // nothing playing: silence up to the clock (never ahead of it)
            let due = start.elapsed().as_micros() as u64 * RATE / 1_000_000;
            if due > frames_out {
                let n = (due - frames_out).min(RATE / 2) as usize;
                out.write_all(&vec![0u8; n * CH * 2])?;
                frames_out += n as u64;
            }
        }
        // if the program played faster than the clock (it can't for long), let silence catch it up later
        out.flush()?;
    }
}
