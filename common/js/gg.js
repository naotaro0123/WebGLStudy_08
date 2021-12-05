export function createShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  const success = gl.getShaderParameter(shader, gl.COMPILE_STATUS);
  if (success) {
    return shader;
  }

  console.log(gl.getShaderInfoLog(shader)); // eslint-disable-line
  gl.deleteShader(shader);
  return undefined;
}

export function createProgram(gl, vertexShader, fragmentShader) {
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  const success = gl.getProgramParameter(program, gl.LINK_STATUS);
  if (success) {
    return program;
  }

  console.log(gl.getProgramInfoLog(program)); // eslint-disable-line
  gl.deleteProgram(program);
  return undefined;
}
/*
 ** Image ファイル (8/16/24/32bit) を読み込む
 **
 **   name 読み込むファイル名
 **   @returns Promise<{width, height, image}>
 **   width 読み込んだファイルの横の画素数
 **   height 読み込んだファイルの縦の画素数
 **   image 読み込んだ画像を格納する vector
 */
export function ggReadImage(name) {
  return new Promise((res, rej) => {
    const image = new Image();
    image.onload = () => {
      res({
        image,
        width: image.width,
        height: image.height,
      });
    };
    image.onerror = (e) => rej(e);
    image.src = name;
  });
}

/*
 ** 画像ファイルの高さマップ読み込んでテクスチャメモリに法線マップを作成する
 **   name 読み込むファイル名
 **   nz 作成した法線の z 成分の割合
 **   gl glコンテキスト
 */
export async function ggLoadHeight(name, normalMap, nz, gl) {
  // const { width, height } = await ggReadImage(name);
  const arraybuffer = await fetch(name).then((res) => {
    return res.arrayBuffer();
  });
  // 符号なし 8 ビット整数の配列で扱う
  const bytes = new Uint8Array(arraybuffer);
  const format = gl.BGRA;
  const internal = gl.RGB16F;

  const chunk = bytes.slice(8);
  const width = chunk.slice(0, 4);
  const height = chunk.slice(4, 8);

  console.log(chunk.slice(0, 25));
  // 法線マップを作成する
  const { nmap } = ggCreateNormalMap(
    image,
    width,
    height,
    format,
    nz,
    internal,
    gl
  );
  // テクスチャを作成して返す
  return ggLoadTexture(image, normalMap, nmap, gl);
}

/*
 ** グレースケール画像 (8bit) から法線マップのデータを作成する
 **   hmap グレースケール画像のデータ
 **   width 高さマップのグレースケール画像 hmap の横の画素数
 **   height 高さマップのグレースケール画像のデータ hmap の縦の画素数
 **   nz 法線の z 成分の割合
 **   internal テクスチャの内部フォーマット
 **   gl glコンテキスト
 */
function ggCreateNormalMap(hmap, width, height, format, nz, internal, gl) {
  // メモリサイズ
  const size = width * height;
  // 画素のバイト数
  let stride = 0;
  switch (format) {
    case gl.RED:
      stride = 1;
      break;
    case gl.RG:
      stride = 2;
      break;
    case gl.RGB:
    case gl.BGR:
      stride = 3;
      break;
    default:
      stride = 1;
      break;
  }
  let idx = 0;
  const nmap = [];
  console.log("hmap", hmap);
  // 法線マップの作成
  for (let i = 0; i < 2; i++) {
    const x = i % width;
    const y = i - x;
    const u0 = (y + ((x - 1 + width) % width)) * stride;
    const u1 = (y + ((x + 1) % width)) * stride;
    const v0 = (((y - width + size) % size) + x) * stride;
    const v1 = (((y + width) % size) + x) * stride;

    console.log("x:", x, "y:", y, "u0:", u0, "u1:", u1, "v0:", v0, "v1:", v1);
    // 隣接する画素との値の差を法線の成分に用いる
    idx = i * 4;
    nmap[idx + 0] = hmap[u1] - hmap[u0];
    nmap[idx + 1] = hmap[v1] - hmap[v0];
    nmap[idx + 2] = nz;
    nmap[idx + 3] = hmap[i * stride];
    // 法線ベクトルを正規化する
    // ggNormalize3(nmap[i]);
  }
  console.log("nmap", nmap);

  // 内部フォーマットが浮動小数点テクスチャでなければ [0,1] に正規化する
  if (
    internal != gl.RGB16F &&
    internal != gl.RGBA16F &&
    internal != gl.RGB32F &&
    internal != gl.RGBA32F
  ) {
    for (let i = 0; i < size; ++i) {
      idx = i * 4;
      nmap[idx + 0] = nmap[idx + 0] * 0.5 + 0.5;
      nmap[idx + 1] = nmap[idx + 1] * 0.5 + 0.5;
      nmap[idx + 2] = nmap[idx + 2] * 0.5 + 0.5;
      nmap[idx + 3] *= 0.0039215686; // == 1/255
    }
  }

  return {
    hmap,
    nmap,
  };
}

/*
 ** GgVector 型の 3 要素の正規化
 */
function ggNormalize3(a) {
  const l = ggLength3(a);
  if (l > 0.0) {
    a[0] /= l;
    a[1] /= l;
    a[2] /= l;
  }
}

function ggLength3(a) {
  return Math.sqrt(ggDot3(a, a));
}

function ggDot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function ggLoadTexture(image, createdTexture, tv, gl) {
  createdTexture = gl.createTexture();
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tv), gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D, createdTexture);

  // テクスチャメモリを確保して画像を転送する
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, image);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.generateMipmap(gl.TEXTURE_2D);
}
