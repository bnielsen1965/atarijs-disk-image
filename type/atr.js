// atr.js

module.exports = createATRImage;

/**
 * Create image instance.
 * @param {string} imageFilePath - The path and filename to the image file.
 * @return {object} The ATR disk image instance.
 */
function createATRImage(imageFilePath) {
  var disk = function() {};

  var BOOT_SECTORS_LOGICAL  = 0;
  var BOOT_SECTORS_PHYSICAL = 1;
  var BOOT_SECTORS_SIO2PC   = 2;

  var DRIVE_STATUS_OFF = 0;
  var DRIVE_STATUS_NODISK = 1;
  var DRIVE_STATUS_READONLY = 2;
  var DRIVE_STATUS_READWRITE = 3;

  var ATR_SIGNATURE_LSB = 0x96;
  var ATR_SIGNATURE_MSB = 0x02;
  var ATR_SIGNATURE = 0x0296;
  var ATR_HEADER_SIZE = 16;

  var driveStatus = DRIVE_STATUS_OFF;
  var headerSize = ATR_HEADER_SIZE;
  var headerBytes = null;
  var signature = null;
  var image = null;
  var bootSectorType = null;
  var sectorSize = null;
  var sectorCount = null;


  disk.unloadImage = function() {
    headerSize = ATR_HEADER_SIZE;
    headerBytes = null;
    signature = null;
    image = null;
    bootSectorType = null;
    sectorSize = null;
    sectorCount = null;
    driveStatus = DRIVE_STATUS_NODISK;
  };


  disk.exportImage = function() {
    var imageCopy = new Uint8Array(image.slice(0));
    return imageCopy;
  };


  disk.importImage = function(image, filePath) {
    disk._loadImage(image);
    imageFilePath = filePath;
  };


  disk.saveImage = function(filePath) {
    require('fs').writeFileSync(filePath || imageFilePath, image);
  };


  disk.loadImage = function(filePath) {
    // should unload to reset
    disk.unloadImage();

    try {
      image = require('fs').readFileSync(filePath);
      disk._loadImage(image);
      imageFilePath = filePath;
    }
    catch (e) {
      throw new Error('Image load failed. ' + e.toString());
    }
  };


  disk._loadImage = function(rawImage) {
    try {
      image = rawImage;
      var atrHeaderBytes = new Uint8Array(image.slice(0, ATR_HEADER_SIZE));
      var signatureTest = (atrHeaderBytes[1] << 8) + atrHeaderBytes[0];
      if (signatureTest !== ATR_SIGNATURE) {
        image = null;
        throw new Error('Image load failed. Invalid ATR image signature.');
      }

      headerBytes = atrHeaderBytes;
      signature = signatureTest;
      driveStatus = (headerBytes[15] ? DRIVE_STATUS_READONLY : DRIVE_STATUS_READWRITE);
      bootSectorType = BOOT_SECTORS_LOGICAL;
      sectorSize = (headerBytes[5] << 8) + headerBytes[4];
      sectorCount = ((headerBytes[7] << 24) + (headerBytes[6] << 16) + (headerBytes[3] << 8) + headerBytes[2]) >> 3;

      // fix number of sectors if double density
      if (sectorSize === 256) {
        if (sectorCount & 1) {
          // logical (128 byte) boot sectors
          sectorCount += 3;
        }
        else {
          // 256 byte boot sectors
          // check if physical or SIO2PC: physical if there's a non-zero byte in
          // 0x190-0x30f of the ATR file
          var sectorCheck = new Uint8Array(image.slice(0x190,0x180));
          bootSectorType = BOOT_SECTORS_SIO2PC;
          sectorCheck.forEach(function(sectorValue) {
            if (sectorValue) {
              bootSectorType = BOOT_SECTORS_PHYSICAL;
            }
          });
        }
        sectorCount >>= 1;
      }

    }
    catch (e) {
      throw new Error('Image load failed. ' + e.toString());
    }
  };


  disk.getStatusBytes = function() {
    if (driveStatus === DRIVE_STATUS_OFF) {
      return null;
    }
    var commandStatus = 16; /* drive active */
    //commandStatus |= (ioSuccess ? 0 : 4);  /* failed RW-operation */
    commandStatus |= (driveStatus === DRIVE_STATUS_READONLY ? 8 : 0);    /* write protection */
    commandStatus |= (sectorSize === 256 ? 32 : 0);  /* double density */
    commandStatus |= (sectorCount === 1040 ? 128 : 0);  /* 1050 enhanced density */
    var hardwareStatus = (driveStatus === DRIVE_STATUS_NODISK ? 127 : 255);
    var timeoutLSB = 1;
    var timeoutMSB = 0;
    return [commandStatus, hardwareStatus, timeoutLSB, timeoutMSB];
  };


  disk.getSector = function(sector) {
    if (driveStatus === DRIVE_STATUS_OFF) {
      return null;
    }

    var offset = 0;
    var size = 128;
    if (sector < 4) {
		  // special case for first three sectors in ATR and XFD image
		  offset = (sector - 1) * (bootSectorType == BOOT_SECTORS_PHYSICAL ? 256 : 128);
	  }
	  else {
		  size = sectorSize;
		  offset = (bootSectorType == BOOT_SECTORS_LOGICAL ? 0x180 : 0x300) + (sector - 4) * size;
	  }
    return image.slice(headerSize + offset, headerSize + offset + size);

  };


  disk.putSector = function(sector, data) {
    var start = (sector < 4 ? (sector - 1) * 128 : (sector - 1) * sectorSize - (sectorSize === 256 ? 384 : 0));
    var end = start + (sector < 4 ? 128 : sectorSize);
    data.forEach(function(val, ind) {
      image[headerSize + start + ind] = val;
    });
  };


  disk.format = function(formatSectorSize, formatSectorCount) {
    var formatBootSectorType = BOOT_SECTORS_LOGICAL;
    var formatBootSectorSize = 128;
    var formatBootSectorCount = formatSectorCount < 3 ? formatSectorCount : 3;
		var diskSize = formatBootSectorSize * formatBootSectorCount + formatSectorSize * (formatSectorCount - formatBootSectorCount);
    var atrSectors = diskSize >> 4;
    var atrHeaderBytes = new Uint8Array(ATR_HEADER_SIZE);
    atrHeaderBytes.fill(0);
    atrHeaderBytes[0] = ATR_SIGNATURE_LSB;
    atrHeaderBytes[1] = ATR_SIGNATURE_MSB;
    atrHeaderBytes[4] = formatSectorSize & 0xff;
    atrHeaderBytes[5] = (formatSectorSize >> 8) & 0xff;
    atrHeaderBytes[2] = atrSectors & 0xff;
    atrHeaderBytes[3] = (atrSectors >> 8) & 0xff;
    atrHeaderBytes[6] = (atrSectors >> 16) & 0xff;
    atrHeaderBytes[7] = (atrSectors >> 24) & 0xff;

    // create blank image
    image = new Uint8Array(diskSize + headerSize);
    image.fill(0x00);

    // write ATR header
    atrHeaderBytes.forEach(function(byte, index) {
      image[index] = byte;
    });

    // set image parameters
    signature = (atrHeaderBytes[1] << 8) + atrHeaderBytes[0];
    imageFilePath = null;
    headerBytes = atrHeaderBytes;
    driveStatus = DRIVE_STATUS_READWRITE;
    bootSectorType = formatBootSectorType;
    sectorSize = (atrHeaderBytes[5] << 8) + atrHeaderBytes[4];
    sectorCount = ((atrHeaderBytes[7] << 24) + (atrHeaderBytes[6] << 16) + (atrHeaderBytes[3] << 8) + atrHeaderBytes[2]) >> 3;
  };

  disk.getSectorSize = function(sectorNumber) {

    if (sectorNumber && sectorNumber < 4) {
      return 128;
    }
    return sectorSize;
  };

  disk.getSectorCount = function() {
    return sectorCount;
  };


  disk.isReadOnly = function() {
    return driveStatus === DRIVE_STATUS_READONLY;
  };


  disk.getImageFilename = function() {
    return imageFilePath ? require('path').basename(imageFilePath) : '';
  };


  // if instance created with an image file path then load image file
  if (imageFilePath) {
    disk.loadImage(imageFilePath);
  }


  return disk;
}
