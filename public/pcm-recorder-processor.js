class PCMRecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buffer = [];
    this._microBuffer = [];
    this._sampleCount = 0;
    this._targetSamples = 0;
    this._microTargetSamples = 0;
    this._microSampleCount = 0;

    this.port.onmessage = (e) => {
      if (e.data.type === 'configure') {
        this._targetSamples = e.data.targetSamples;
        this._microTargetSamples = e.data.microTargetSamples || 0;
      } else if (e.data.type === 'flush') {
        if (this._buffer.length > 0) {
          const pcm = new Float32Array(this._buffer);
          this.port.postMessage({ type: 'segment', pcm }, [pcm.buffer]);
          this._buffer = [];
          this._microBuffer = [];
          this._sampleCount = 0;
          this._microSampleCount = 0;
        }
      }
    };
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || !input[0]) return true;

    const channelData = input[0];
    for (let i = 0; i < channelData.length; i++) {
      this._buffer.push(channelData[i]);
      this._microBuffer.push(channelData[i]);
    }
    this._sampleCount += channelData.length;
    this._microSampleCount += channelData.length;

    if (this._microTargetSamples > 0 && this._microSampleCount >= this._microTargetSamples) {
      const pcm = new Float32Array(this._microBuffer);
      this.port.postMessage({ type: 'micro-segment', pcm }, [pcm.buffer]);
      this._microBuffer = [];
      this._microSampleCount = 0;
    }

    if (this._targetSamples > 0 && this._sampleCount >= this._targetSamples) {
      const pcm = new Float32Array(this._buffer);
      this.port.postMessage({ type: 'segment', pcm }, [pcm.buffer]);
      this._buffer = [];
      this._microBuffer = [];
      this._sampleCount = 0;
      this._microSampleCount = 0;
    }
    return true;
  }
}

registerProcessor('pcm-recorder', PCMRecorderProcessor);
