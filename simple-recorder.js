#!/usr/bin/env node

const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');

class SimpleRecorder {
    constructor() {
        this.isRecording = false;
        this.ffmpegProcess = null;
        this.recordingPath = null;
    }

    async checkPermissions() {
        console.log('🔐 Checking microphone permissions...');
        
        // Use a simple test to trigger permission dialog
        return new Promise((resolve) => {
            const testProcess = spawn('ffmpeg', [
                '-f', 'avfoundation',
                '-i', ':0',  // Default microphone
                '-t', '0.1', // Record for 0.1 seconds
                '-y',
                '/tmp/permission-test.wav'
            ], { stdio: 'pipe' });

            testProcess.on('close', (code) => {
                // Clean up test file
                try { fs.unlinkSync('/tmp/permission-test.wav'); } catch {}
                
                if (code === 0) {
                    console.log('✅ Microphone permissions OK');
                    resolve(true);
                } else {
                    console.log('❌ Microphone permission issue (code:', code, ')');
                    resolve(false);
                }
            });

            // Give it 3 seconds max for permission dialog
            setTimeout(() => {
                testProcess.kill();
                resolve(false);
            }, 3000);
        });
    }

    async listAudioDevices() {
        console.log('🎤 Detecting audio devices...');
        
        return new Promise((resolve) => {
            const deviceProcess = spawn('ffmpeg', ['-f', 'avfoundation', '-list_devices', 'true', '-i', ''], 
                { stdio: 'pipe' });
            
            let output = '';
            deviceProcess.stderr.on('data', (data) => {
                output += data.toString();
            });

            deviceProcess.on('close', () => {
                const devices = this.parseAudioDevices(output);
                console.log('📱 Found devices:', devices.map(d => `  • ${d.name}`).join('\n'));
                resolve(devices);
            });
        });
    }

    parseAudioDevices(output) {
        const devices = [];
        const lines = output.split('\n');
        let inAudioSection = false;

        for (const line of lines) {
            if (line.includes('AVFoundation audio devices')) {
                inAudioSection = true;
                continue;
            }
            if (inAudioSection && line.includes('AVFoundation video devices')) {
                break;
            }
            if (inAudioSection) {
                const match = line.match(/\[(\d+)\]\s+(.+)/);
                if (match) {
                    devices.push({
                        id: parseInt(match[1]),
                        name: match[2].trim()
                    });
                }
            }
        }
        return devices;
    }

    async startRecording(outputPath, deviceId = null) {
        if (this.isRecording) {
            throw new Error('Already recording');
        }

        console.log('🎙️ Starting audio recording...');
        console.log('📁 Output path:', outputPath);

        // Ensure output directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        this.recordingPath = outputPath;
        
        // Use default microphone if no device specified
        const input = deviceId !== null ? `:${deviceId}` : ':0';
        
        const args = [
            '-f', 'avfoundation',
            '-i', input,
            '-ac', '2',           // 2 channels (stereo)
            '-ar', '44100',       // 44.1kHz sample rate
            '-c:a', 'pcm_s16le',  // 16-bit PCM
            '-y',                 // Overwrite output file
            outputPath
        ];

        console.log('🔧 FFmpeg command:', 'ffmpeg', args.join(' '));

        this.ffmpegProcess = spawn('ffmpeg', args, { stdio: 'pipe' });
        this.isRecording = true;

        let errorOutput = '';
        this.ffmpegProcess.stderr.on('data', (data) => {
            errorOutput += data.toString();
            // Look for level indicators in real-time
            const levelMatch = data.toString().match(/\[Parsed_showvolume.*?\] \d+:\d+ volume: ([\d.-]+)/);
            if (levelMatch) {
                console.log(`🔊 Audio level: ${levelMatch[1]}`);
            }
        });

        this.ffmpegProcess.on('close', (code) => {
            this.isRecording = false;
            console.log(`📊 Recording finished with code: ${code}`);
            
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`📁 File size: ${stats.size} bytes`);
                
                if (stats.size < 1000) {
                    console.log('⚠️ Warning: File size is very small, recording may have failed');
                    console.log('🔧 FFmpeg output:', errorOutput);
                }
            } else {
                console.log('❌ No output file created');
                console.log('🔧 FFmpeg output:', errorOutput);
            }
        });

        // Monitor recording levels every second
        const levelMonitor = setInterval(() => {
            if (!this.isRecording) {
                clearInterval(levelMonitor);
                return;
            }
            
            if (fs.existsSync(outputPath)) {
                const stats = fs.statSync(outputPath);
                console.log(`📈 Current file size: ${stats.size} bytes`);
            }
        }, 1000);

        return true;
    }

    async stopRecording() {
        if (!this.isRecording || !this.ffmpegProcess) {
            console.log('❌ Not currently recording');
            return false;
        }

        console.log('⏹️ Stopping recording...');
        
        // Send SIGTERM to ffmpeg for clean shutdown
        this.ffmpegProcess.kill('SIGTERM');
        
        // Wait for process to finish
        return new Promise((resolve) => {
            this.ffmpegProcess.on('close', () => {
                this.ffmpegProcess = null;
                console.log('✅ Recording stopped');
                resolve(true);
            });
            
            // Force kill after 5 seconds if it doesn't stop gracefully
            setTimeout(() => {
                if (this.ffmpegProcess) {
                    this.ffmpegProcess.kill('SIGKILL');
                    this.ffmpegProcess = null;
                }
                resolve(false);
            }, 5000);
        });
    }
}

// CLI interface
async function main() {
    const recorder = new SimpleRecorder();
    const args = process.argv.slice(2);
    
    if (args.includes('--help') || args.length === 0) {
        console.log(`
🎙️ Simple Audio Recorder

Usage:
  node simple-recorder.js --record <output-file> [--device <id>] [--duration <seconds>]
  node simple-recorder.js --list-devices
  node simple-recorder.js --test-permissions

Examples:
  node simple-recorder.js --record /tmp/test.wav --duration 5
  node simple-recorder.js --list-devices
        `);
        return;
    }

    if (args.includes('--list-devices')) {
        await recorder.listAudioDevices();
        return;
    }

    if (args.includes('--test-permissions')) {
        const hasPermission = await recorder.checkPermissions();
        console.log('🔐 Permission status:', hasPermission ? 'GRANTED' : 'DENIED');
        return;
    }

    const recordIndex = args.indexOf('--record');
    if (recordIndex === -1 || recordIndex + 1 >= args.length) {
        console.log('❌ Please specify output file with --record');
        return;
    }

    const outputFile = args[recordIndex + 1];
    const deviceIndex = args.indexOf('--device');
    const deviceId = deviceIndex !== -1 && deviceIndex + 1 < args.length ? 
        parseInt(args[deviceIndex + 1]) : null;
    
    const durationIndex = args.indexOf('--duration');
    const duration = durationIndex !== -1 && durationIndex + 1 < args.length ? 
        parseInt(args[durationIndex + 1]) : null;

    // Check permissions first
    const hasPermission = await recorder.checkPermissions();
    if (!hasPermission) {
        console.log('❌ Microphone permission required. Please grant access and try again.');
        return;
    }

    // List devices
    await recorder.listAudioDevices();

    // Start recording
    await recorder.startRecording(outputFile, deviceId);

    if (duration) {
        console.log(`⏰ Recording for ${duration} seconds...`);
        setTimeout(async () => {
            await recorder.stopRecording();
            process.exit(0);
        }, duration * 1000);
    } else {
        console.log('🔴 Recording... Press Ctrl+C to stop');
        
        process.on('SIGINT', async () => {
            console.log('\n⏹️ Received stop signal...');
            await recorder.stopRecording();
            process.exit(0);
        });
    }
}

if (require.main === module) {
    main().catch(console.error);
}

module.exports = SimpleRecorder; 