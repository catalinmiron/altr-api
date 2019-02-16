const Koa = require('koa');
const Router = require('koa-router');
const bodyParser = require('koa-body');
const path = require('path');
const fs = require('fs-extra');
const shortid = require('shortid');
const send = require('koa-send');
const request = require('request');
const cors = require('@koa/cors');

const { formats } = require('./config.json');
const makeImage = require('./makeImage');
const makeVideo = require('./makeVideo');
const makeAudio = require('./makeAudio');

const app = new Koa();
const router = new Router();

const allowedOrigins = ['http://localhost:8080', 'https://altr.api'];
const corsOpts = {
  origin: ctx => {
    const { origin } = ctx.request.headers;
    if (!allowedOrigins.includes(origin)) return false;
    return origin;
  }
};
app.use(cors(corsOpts));

// ensure the upload directory exists
const uploadDir = path.resolve('uploads');
fs.ensureDirSync(uploadDir);

// configure file uploads
app.use(
  bodyParser({
    multipart: true,
    formidable: {
      keepExtensions: true,
      uploadDir,
      onFileBegin: (name, file) => {
        // rename the file with a short id
        file.path = path.join(uploadDir, `${shortid.generate()}${path.extname(file.name)}`);
      }
    }
  })
);

// error handling
app.use(async (ctx, next) => {
  try {
    await next();
  } catch (err) {
    ctx.response.status = err.status || 500;
    ctx.response.body = err.message;
    if (ctx.state.file) fs.remove(ctx.state.file.path);
  }
});

// proxy file requests for clients
router.post('/fetch', async ctx => {
  ctx.response.body = request(ctx.request.body.url, err => {
    if (err) ctx.throw(502, 'Failed to fetch content');
  });
});

// validate upload data
const validate = async (ctx, next) => {
  // check for a file
  if (ctx.request.files && ctx.request.files.file) ctx.state.file = ctx.request.files.file;
  else ctx.throw(400, 'Please provide a file with the key "file"');

  ctx.state.options = ctx.request.body;

  // check file extension
  const from = path.extname(ctx.state.file.name).slice(1);
  const to = ctx.state.options.format || from;
  if (formats.image.i.includes(from) && formats.image.o.includes(to)) ctx.state.type = 'image';
  else if (formats.video.i.includes(from) && formats.video.o.includes(to)) ctx.state.type = 'video';
  else if (formats.audio.i.includes(from) && formats.audio.o.includes(to)) ctx.state.type = 'audio';
  else ctx.throw(422, 'Invalid file formats');

  // validate options
  const { options } = ctx.state;
  const errs = [];

  if (options.width && options.width < 1) errs.push('Invalid width, must be > 1');
  if (options.height && options.height < 1) errs.push('Invalid height, must be > 1');
  if (options.quality && (options.quality < 1 || options.quality > 100)) errs.push('Invalid quality, must be 1-100');
  if (options.compression && (options.compression < 0 || options.compression > 7))
    errs.push('Invalid compression, must be 0-7');
  if (options.start && options.start < 0) errs.push('Invalid start time, must be ≥ 0');
  if (options.end && options.end < 0) errs.push('Invalid end time, must be ≥ 0');

  if (errs.length) ctx.throw(422, errs.join('\n'));

  await next();
};

// accept & process uploads
router.post('/upload', validate, async ctx => {
  const { file, type, options } = ctx.state;
  let outputPath;

  try {
    if (type === 'image') outputPath = await makeImage(file, options);
    else if (type === 'video') outputPath = await makeVideo(file, options);
    else if (type === 'audio') outputPath = await makeAudio(file, options);

    // send the result to the client and delete it
    await send(ctx, `uploads/${path.basename(outputPath)}`);
    fs.remove(outputPath);
  } catch (err) {
    ctx.response.status = 500;
    ctx.response.body = 'Something went wrong :(';
  }

  // remove the original when we're done
  fs.remove(ctx.state.file.path);
});

app.use(router.routes());
app.use(router.allowedMethods());

app.listen(3000);
