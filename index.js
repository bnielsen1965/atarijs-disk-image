// index.js

module.exports = createImage;

/**
 * Create disk image instance.
 * @param {string} imageFilePath - The path and filename to the image file.
 * @return {object} The disk image instance.
 */
function createImage(imageFilePath) {
  var image = function() {};

  var TYPE_ATR = 1;

  var diskImage = null;


  image.unloadImage = function() {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    diskImage.unloadImage();
  };


  image.loadImage = function(filePath, readOnly) {
    var ext = filePath.substr(filePath.lastIndexOf('.') + 1);
    switch (ext) {
      case 'atr':
      case 'ATR':
      diskImage = require('./type/atrimage.js')(filePath);
      break;

      default:
      throw new Error('Load image failed, unknown file extension type.');
    }
  };


  image.getStatusBytes = function() {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    return diskImage.getStatusBytes();
  };


  image.getSector = function(sector) {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    return diskImage.getSector(sector);
  };


  image.putSector = function(sector, data) {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    diskImage.putSector(sector, data);
  };


  image.format = function(sectorSize, sectorCount) {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    diskImage.format(sectorSize, sectorCount);
  };


  image.getSectorSize = function(sectorNumber) {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    return diskImage.getSectorSize();
  };


  image.getSectorCount = function() {
    if (!diskImage) {
      throw new Error('No disk image.');
    }

    return diskImage.getSectorCount();
  };


  if (imageFilePath) {
    image.loadImage(imageFilePath);
  }


  return image;
}
