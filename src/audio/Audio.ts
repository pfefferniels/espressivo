/**
 * Represents audio format information, replacing javax.sound.sampled.AudioFormat.
 */
export interface AudioFormat {
    sampleRate: number;
    sampleSizeInBits: number;
    channels: number;
    signed: boolean;
    bigEndian: boolean;
}

/**
 * This class represents audio data.
 * Port of meico.audio.Audio
 *
 * In the Java version, this class uses javax.sound.sampled for audio I/O,
 * the Lame library for MP3 encoding/decoding, and Jipes for audio analysis.
 * In this TypeScript port:
 * - Audio data is stored as a Uint8Array (raw PCM bytes).
 * - AudioFormat is a simple object with format metadata.
 * - File I/O is replaced with string/buffer-based operations.
 * - AudioPlayer is skipped entirely.
 * - MP3 encoding/decoding and spectrogram analysis are stubbed out.
 *
 * @author Axel Berndt.
 */
export class Audio {
    private static readonly MP3 = "mp3";
    private static readonly WAVE = "wav";

    private file: string | null = null;
    private audio: Uint8Array;
    private format: AudioFormat | null = null;
    private fileType: string | null = null;

    /**
     * constructor, generates empty instance
     */
    constructor();
    /**
     * constructor with explicit audio data, format, and filename
     * @param audioData the raw PCM audio data
     * @param format the audio format
     * @param file optional filename
     */
    constructor(audioData: Uint8Array, format: AudioFormat, file?: string);
    constructor(audioData?: Uint8Array, format?: AudioFormat, file?: string) {
        if (audioData !== undefined && format !== undefined) {
            this.audio = audioData;
            this.format = format;
            if (file !== undefined) {
                this.file = file;
                this.fileType = file.substring(file.lastIndexOf(".") + 1);
            }
        } else {
            this.audio = new Uint8Array(0);
        }
    }

    /**
     * Factory method to create Audio from a WAV file buffer.
     * Parses the WAV header and extracts PCM data.
     * @param wavData the WAV file as a Uint8Array (including header)
     * @param filename optional filename
     * @return the Audio instance or null on error
     */
    static fromWav(wavData: Uint8Array, filename?: string): Audio | null {
        try {
            const view = new DataView(wavData.buffer, wavData.byteOffset, wavData.byteLength);

            // Verify RIFF header
            const riff = String.fromCharCode(wavData[0], wavData[1], wavData[2], wavData[3]);
            if (riff !== "RIFF") {
                console.error("Not a valid WAV file: missing RIFF header.");
                return null;
            }

            // Verify WAVE format
            const wave = String.fromCharCode(wavData[8], wavData[9], wavData[10], wavData[11]);
            if (wave !== "WAVE") {
                console.error("Not a valid WAV file: missing WAVE format.");
                return null;
            }

            // Find the fmt chunk
            let offset = 12;
            let fmtFound = false;
            let channels = 1;
            let sampleRate = 44100;
            let bitsPerSample = 16;

            while (offset < wavData.length - 8) {
                const chunkId = String.fromCharCode(wavData[offset], wavData[offset + 1], wavData[offset + 2], wavData[offset + 3]);
                const chunkSize = view.getUint32(offset + 4, true);

                if (chunkId === "fmt ") {
                    // const audioFormat = view.getUint16(offset + 8, true);
                    channels = view.getUint16(offset + 10, true);
                    sampleRate = view.getUint32(offset + 12, true);
                    // const byteRate = view.getUint32(offset + 16, true);
                    // const blockAlign = view.getUint16(offset + 20, true);
                    bitsPerSample = view.getUint16(offset + 22, true);
                    fmtFound = true;
                    offset += 8 + chunkSize;
                } else if (chunkId === "data") {
                    if (!fmtFound) {
                        console.error("WAV file: data chunk found before fmt chunk.");
                        return null;
                    }
                    const pcmData = new Uint8Array(wavData.buffer, wavData.byteOffset + offset + 8, chunkSize);

                    const format: AudioFormat = {
                        sampleRate: sampleRate,
                        sampleSizeInBits: bitsPerSample,
                        channels: channels,
                        signed: true,
                        bigEndian: false
                    };

                    const audio = new Audio(new Uint8Array(pcmData), format, filename);
                    audio.fileType = Audio.WAVE;
                    return audio;
                } else {
                    offset += 8 + chunkSize;
                }
            }

            console.error("WAV file: no data chunk found.");
            return null;
        } catch (e) {
            console.error("Error parsing WAV file:", e);
            return null;
        }
    }

    /**
     * Factory method to create Audio from an MP3 file buffer.
     * TODO: Implement MP3 decoding.
     * @param _mp3Data the MP3 file as a Uint8Array
     * @param _filename optional filename
     * @return the Audio instance or null
     */
    static fromMp3(_mp3Data: Uint8Array, _filename?: string): Audio | null {
        // TODO: Implement MP3 decoding (e.g., using a library like lamejs or mpg123)
        console.error("MP3 decoding is not yet supported in this TypeScript port.");
        return null;
    }

    /**
     * This can be used to convert the byte array of an Audio object into an array of doubles between -1.0 and 1.0
     * which is far more convenient for audio analyses.
     *
     * @param array
     * @param format
     * @return an array of number arrays, each is an audio channel (stereo sequence is [left, right])
     */
    static convertByteArray2DoubleArray(array: Uint8Array, format: AudioFormat): number[][] {
        const channelList: number[][] = [];
        const maxVal = Math.pow(2, format.sampleSizeInBits) / 2.0;

        const c2 = 2 * format.channels;
        const oneChanArrayLength = Math.floor(array.length / c2);

        for (let channel = 0; channel < format.channels; ++channel) {
            const a = channel * 2;
            const output = new Float64Array(oneChanArrayLength);
            for (let i = 0; i < oneChanArrayLength; ++i) {
                const c2ia = c2 * i + a;
                // Read 16-bit little-endian signed sample
                const sample = (array[c2ia + 1] << 8) | (array[c2ia] & 0xFF);
                // Sign extend: if bit 15 is set, it's negative
                const signedSample = (sample > 32767) ? sample - 65536 : sample;
                output[i] = signedSample / maxVal;
            }
            channelList.push(Array.from(output));
        }

        return channelList;
    }

    /**
     * This method converts an input double array into a byte array.
     *
     * @param array
     * @param sampleSizeInBits this will mostly be 16
     * @return
     */
    static convertDoubleArray2ByteArray(array: number[], sampleSizeInBits: number): Uint8Array {
        const maxVal = Math.pow(2, sampleSizeInBits) / 2.0;

        // assumes signed PCM, little endian
        const output = new Uint8Array(2 * array.length);
        for (let i = 0; i < array.length; i++) {
            let b: number;
            if (array[i] === 1.0) {
                b = 32767; // Short.MAX_VALUE
            } else {
                b = Math.floor(array[i] * maxVal);
                // Clamp to 16-bit signed range
                if (b > 32767) b = 32767;
                if (b < -32768) b = -32768;
            }
            output[2 * i] = b & 0xFF;
            output[2 * i + 1] = (b >> 8) & 0xFF; // little endian
        }
        return output;
    }

    /**
     * Convert PCM data to WAV file format (adds WAV header).
     * @param pcmData the raw PCM audio data
     * @param format the audio format
     * @return Uint8Array containing the complete WAV file
     */
    static pcmToWav(pcmData: Uint8Array, format: AudioFormat): Uint8Array {
        const numChannels = format.channels;
        const sampleRate = format.sampleRate;
        const bitsPerSample = format.sampleSizeInBits;
        const byteRate = sampleRate * numChannels * bitsPerSample / 8;
        const blockAlign = numChannels * bitsPerSample / 8;
        const dataSize = pcmData.length;
        const headerSize = 44;
        const totalSize = headerSize + dataSize;

        const buffer = new ArrayBuffer(totalSize);
        const view = new DataView(buffer);
        const bytes = new Uint8Array(buffer);

        // RIFF header
        bytes[0] = 0x52; bytes[1] = 0x49; bytes[2] = 0x46; bytes[3] = 0x46; // "RIFF"
        view.setUint32(4, totalSize - 8, true);
        bytes[8] = 0x57; bytes[9] = 0x41; bytes[10] = 0x56; bytes[11] = 0x45; // "WAVE"

        // fmt subchunk
        bytes[12] = 0x66; bytes[13] = 0x6D; bytes[14] = 0x74; bytes[15] = 0x20; // "fmt "
        view.setUint32(16, 16, true);       // subchunk size
        view.setUint16(20, 1, true);        // audio format (1 = PCM)
        view.setUint16(22, numChannels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);

        // data subchunk
        bytes[36] = 0x64; bytes[37] = 0x61; bytes[38] = 0x74; bytes[39] = 0x61; // "data"
        view.setUint32(40, dataSize, true);

        // Copy PCM data
        bytes.set(pcmData, headerSize);

        return bytes;
    }

    /**
     * check if there is data in the audio byte array
     * @return
     */
    isEmpty(): boolean {
        return (this.audio === null) || (this.audio.length === 0);
    }

    /**
     * a setter for the file name
     * @param file
     */
    setFile(file: string): void {
        this.file = file;
        this.fileType = file.substring(file.lastIndexOf(".") + 1);
    }

    /**
     * a getter for the file name
     * @return
     */
    getFile(): string | null {
        return this.file;
    }

    /**
     * a getter for the audio data
     * @return
     */
    getAudio(): Uint8Array {
        return this.audio;
    }

    /**
     * a getter for the audio format
     * @return
     */
    getFormat(): AudioFormat | null {
        return this.format;
    }

    /**
     * a getter for the sample rate
     * @return
     */
    getSampleRate(): number {
        return this.format !== null ? this.format.sampleRate : 0;
    }

    /**
     * a getter for the sample size in bits
     * @return
     */
    getSampleSizeInBits(): number {
        return this.format !== null ? this.format.sampleSizeInBits : 0;
    }

    /**
     * a getter for the frame size
     * @return
     */
    getFrameSize(): number {
        if (this.format === null) return 0;
        return this.format.channels * (this.format.sampleSizeInBits / 8);
    }

    /**
     * a getter for the frame rate
     * @return
     */
    getFrameRate(): number {
        return this.format !== null ? this.format.sampleRate : 0;
    }

    /**
     * a getter for the number of channels
     * @return
     */
    getChannels(): number {
        return this.format !== null ? this.format.channels : 0;
    }

    /**
     * a getter for the encoding type
     * @return
     */
    getEncoding(): string {
        if (this.format === null) return "unknown";
        return this.format.signed ? "PCM_SIGNED" : "PCM_UNSIGNED";
    }

    /**
     * a getter for the bigEndian flag
     * @return
     */
    isBigEndian(): boolean {
        return this.format !== null ? this.format.bigEndian : false;
    }

    /**
     * exports audio data as a WAV file buffer
     * @return Uint8Array containing the WAV file, or null on error
     */
    writeAudio(): Uint8Array | null;
    /**
     * exports audio data as a WAV file buffer with specified filename stored for reference
     * @param filename
     * @return Uint8Array containing the WAV file, or null on error
     */
    writeAudio(filename: string): Uint8Array | null;
    writeAudio(filename?: string): Uint8Array | null {
        if (filename !== undefined) {
            if (this.file === null) {
                this.file = filename;
                this.fileType = Audio.WAVE;
            }
        } else {
            if (this.file === null) {
                console.error("No file specified to write audio data.");
                return null;
            }
        }

        if (this.format === null) {
            console.error("No audio format specified.");
            return null;
        }

        return Audio.pcmToWav(this.audio, this.format);
    }

    /**
     * encode PCM to MP3
     * TODO: Implement MP3 encoding
     * @param _pcm PCM data as Uint8Array
     * @param _format audio format
     * @return mp3 data as Uint8Array or null
     */
    encodePcmToMp3(_pcm: Uint8Array, _format: AudioFormat): Uint8Array | null {
        // TODO: Implement MP3 encoding (e.g., using lamejs)
        console.error("MP3 encoding is not yet supported in this TypeScript port.");
        return null;
    }

    /**
     * returns audio data of this object as MP3 encoded
     * TODO: Implement MP3 encoding
     * @return Uint8Array of MP3 encoded audio data or null
     */
    getAudioAsMp3(): Uint8Array | null {
        if (this.format === null) {
            console.error("No audio format specified.");
            return null;
        }
        return this.encodePcmToMp3(new Uint8Array(this.audio), this.format);
    }

    /**
     * write audio data as MP3
     * TODO: Implement MP3 encoding
     * @return Uint8Array of MP3 data or null
     */
    writeMp3(): Uint8Array | null;
    /**
     * write audio data as MP3 with specified filename
     * TODO: Implement MP3 encoding
     * @param filename
     * @return Uint8Array of MP3 data or null
     */
    writeMp3(filename?: string): Uint8Array | null;
    writeMp3(_filename?: string): Uint8Array | null {
        if (this.format === null) {
            console.error("No audio format specified.");
            return null;
        }

        // TODO: Implement MP3 encoding
        console.error("MP3 writing is not yet supported in this TypeScript port.");
        return null;
    }

    /**
     * Make a waveform image from the audio data.
     * Returns the waveform data as a 2D array of pixel rows (RGBA).
     * TODO: In a browser context, this could return an ImageData or canvas element.
     * @param width the width of the image in pixels
     * @param height the height of the image in pixels
     * @return waveform pixel data as a Uint8ClampedArray (RGBA format, width*height*4 bytes), or null on error
     */
    exportWaveformImage(width: number, height: number): Uint8ClampedArray | null {
        if (this.format === null) {
            console.error("No audio format specified.");
            return null;
        }

        const channels = Audio.convertByteArray2DoubleArray(this.audio, this.format);
        const heightSubdivision = Math.floor(height / channels.length);

        // Create RGBA pixel buffer
        const pixels = new Uint8ClampedArray(width * height * 4);
        // Initialize to black, fully opaque
        for (let i = 0; i < pixels.length; i += 4) {
            pixels[i] = 0;       // R
            pixels[i + 1] = 0;   // G
            pixels[i + 2] = 0;   // B
            pixels[i + 3] = 255; // A
        }

        for (let chanIdx = 0; chanIdx < channels.length; ++chanIdx) {
            const channel = channels[chanIdx];
            const yOffset = chanIdx * heightSubdivision;

            const waveformData = Audio.computeWaveformData(channel, 0, channel.length - 1, width, heightSubdivision);
            if (waveformData === null) continue;

            // Write waveform into the pixel buffer
            for (let y = 0; y < heightSubdivision; ++y) {
                for (let x = 0; x < width; ++x) {
                    const color = waveformData[y * width + x]; // 0 = black, 1 = dark gray center, 2 = white
                    const pixelIdx = ((y + yOffset) * width + x) * 4;
                    if (color === 2) {
                        pixels[pixelIdx] = 255;
                        pixels[pixelIdx + 1] = 255;
                        pixels[pixelIdx + 2] = 255;
                    } else if (color === 1) {
                        pixels[pixelIdx] = 64;
                        pixels[pixelIdx + 1] = 64;
                        pixels[pixelIdx + 2] = 64;
                    }
                    // else stays black
                }
            }
        }

        return pixels;
    }

    /**
     * Compute waveform visualization data from audio amplitude data.
     * Returns an array where each value indicates the pixel type:
     * 0 = background (black), 1 = center line (dark gray), 2 = waveform (white)
     * @param audio the audio amplitude data normalized to [-1.0, 1.0]
     * @param leftmostSample where in the audio data should we start
     * @param rightmostSample where in the audio will we end
     * @param width the width of the image in pixels
     * @param height the height of the image in pixels
     * @return the waveform data array or null
     */
    static computeWaveformData(audio: number[], leftmostSample: number, rightmostSample: number, width: number, height: number): Uint8Array | null {
        const sampleCount = rightmostSample - leftmostSample;
        const sample2xScaleFactor = (sampleCount > 0) ? (width - 1) / sampleCount : 1;
        const maxValues: number[][] = new Array(width);
        const isSet: boolean[] = new Array(width).fill(false);

        for (let i = 0; i < width; ++i) {
            maxValues[i] = [0, 0]; // [positive max, negative min]
        }

        // compute the min and max amplitude values for each pixel column
        for (let i = 0; i < sampleCount; ++i) {
            const x = Math.round(sample2xScaleFactor * i);
            if (x >= width) continue;
            isSet[x] = true;
            const sampleIndex = leftmostSample + i;
            if (sampleIndex >= audio.length) continue;
            if (maxValues[x][0] < audio[sampleIndex])
                maxValues[x][0] = audio[sampleIndex];
            if (maxValues[x][1] > audio[sampleIndex])
                maxValues[x][1] = audio[sampleIndex];
        }

        // draw the waveform
        const result = new Uint8Array(width * height); // all zeros = black
        const yTranslationFactor = -0.5 * height;
        let yPositive = Math.round(-yTranslationFactor);
        let yNegative = yPositive;

        for (let x = 0; x < width; ++x) {
            // draw center line
            if (yPositive >= 0 && yPositive < height) {
                result[yPositive * width + x] = 1; // dark gray
            }

            if (isSet[x]) {
                yPositive = Math.round((maxValues[x][0] * yTranslationFactor) - yTranslationFactor);
                yNegative = Math.round((maxValues[x][1] * yTranslationFactor) - yTranslationFactor);
            }

            // color the pixels from the highest to lowest value
            for (let y = yPositive; y < yNegative && y < height; ++y) {
                if (y >= 0) {
                    result[y * width + x] = 2; // white
                }
            }
        }

        return result;
    }

    /**
     * Compute the CQT spectrogram.
     * TODO: Implement CQT analysis (requires a DSP library).
     * @return null (not implemented)
     */
    exportConstantQTransformSpectrogram(): null {
        // TODO: Implement CQT spectrogram computation
        console.error("CQT spectrogram computation is not yet supported in this TypeScript port.");
        return null;
    }

    /**
     * Get the file type (e.g., "wav" or "mp3")
     * @return
     */
    getFileType(): string | null {
        return this.fileType;
    }
}
