import { codecs as supportedFormats, preprocessors } from './codecs';
import { autoOptimize } from './auto-optimizer';
import JSON5 from 'json5';

export async function decodeBuffer(buffer){
  const firstChunk = buffer.slice(0, 16);
  const firstChunkString = Array.from(firstChunk)
    .map((v) => String.fromCodePoint(v))
    .join('');
  const key = Object.entries(supportedFormats).find(([name, { detectors }]) =>
    detectors.some((detector) => detector.exec(firstChunkString)),
  )?.[0];
  if (!key) {
    throw Error(`${file} has an unsupported format`);
  }
  return (await supportedFormats[key].dec()).decode(
    new Uint8Array(buffer),
  );
}

async function preprocessImage(preprocessorName, options, bitmap) {
  let preprocessor = preprocessors[preprocessorName];

  const instance = await preprocessor.instantiate();
  bitmap = await instance(
    bitmap.data,
    bitmap.width,
    bitmap.height,
    {...preprocessor.defaultOptions, ...options},
  );
  return bitmap;
}

export async function encodeBuffer(bitmapIn, encName, encConfig, optimizerConfig) {
  let out, infoText;
  const encoder = await supportedFormats[encName].enc();
  if (encConfig === 'auto') {
    const optionToOptimize = supportedFormats[encName].autoOptimize.option;
    const decoder = await supportedFormats[encName].dec();
    const encode = (bitmapIn, quality) =>
      encoder.encode(
        bitmapIn.data,
        bitmapIn.width,
        bitmapIn.height,
        Object.assign({}, supportedFormats[encName].defaultEncoderOptions, {
          [optionToOptimize]: quality,
        }),
      );
    const decode = (binary) => decoder.decode(binary);
    const { bitmap, binary, quality } = await autoOptimize(
      bitmapIn,
      encode,
      decode,
      {
        min: supportedFormats[encName].autoOptimize.min,
        max: supportedFormats[encName].autoOptimize.max,
        ...optimizerConfig
      },
    );
    out = binary;
    const opts = {
      // 5 significant digits is enough
      [optionToOptimize]: Math.round(quality * 10000) / 10000,
    };
    infoText = ` using --${encName} '${JSON5.stringify(opts)}'`;
  } else {
    out = encoder.encode(
      bitmapIn.data.buffer,
      bitmapIn.width,
      bitmapIn.height,
      encConfig,
    );
  }
  return { out, infoText };
}


export async function compress(buffer, encName, encConfig, preprocessorConfig, optimizerConfig){
  let decodeResult = await decodeBuffer(buffer)
  if (preprocessorConfig){
    for (let config of preprocessorConfig){
      decodeResult = await preprocessImage(config.name, config.options, decodeResult)
    }
  }
  const encoderDefaults = supportedFormats[encName].defaultEncoderOptions
  const augDefaults = {...{ optimizerButteraugliTarget: 1.4, maxOptimizerRounds: 6}, ...(optimizerConfig||{})}
  return (await encodeBuffer(decodeResult, encName, typeof encConfig === 'string' ? encConfig : {...encoderDefaults, ...encConfig}, augDefaults)).out
}

export async function getImageSize(buffer){
  const decodeResult = await decodeBuffer(buffer)
  return {width: decodeResult.width, height: decodeResult.height}
}
