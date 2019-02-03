const path = require('path');
const sharp = require('sharp');
const shortid = require('shortid');

const _ = require('./config.json');

class Image {
  constructor(file, options) {
    this.file = file;
    this.options = options;
  }

  async process() {
    const outputFormat = this.options.format || path.extname(this.file.name).slice(1);
    const outputPath = path.join(path.dirname(this.file.path), `${shortid.generate()}.${outputFormat}`);
    const output = sharp(this.file.path);

    // resize
    output.resize(parseInt(this.options.width), parseInt(this.options.height), { fit: 'fill' });

    if (outputFormat === 'jpeg' || outputFormat === 'jpg') {
      output.jpeg({
        quality: parseInt(this.options.quality) || 90 // adjust quality (default 90)
      });
    }

    if (outputFormat === 'png') {
      output.png({ adaptiveFiltering: true });
    }

    await output.toFile(outputPath);
    return outputPath;
  }

  validate() {
    const errors = [];

    if (this.options.format && !_.formats.image.out.includes(this.options.format)) {
      errors.push('Invalid output format');
    }
    if (!this.options.width || !this.options.height) {
      errors.push('Missing image dimensions');
    }
    if (this.options.quality && (this.options.quality < 1 || this.options.quality > 100)) {
      errors.push('Quality must be 1-100');
    }

    return errors;
  }
}

module.exports = Image;
