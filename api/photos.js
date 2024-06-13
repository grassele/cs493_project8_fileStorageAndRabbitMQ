/*
 * API sub-router for businesses collection endpoints.
 */
const Router = require('express')

const multer = require('multer')
const crypto = require('crypto')

const { validateAgainstSchema } = require('../lib/validation')
const {
  PhotoSchema,
  insertNewPhoto,
  getPhotoById
} = require('../models/photo')

const { GridFSBucket, ObjectId } = require('mongodb')
const fs = require('fs')
const { getDbReference } = require('../lib/mongo')

const router = Router()

/*
 * Message queueing functionality with RabbitMQ
 */
const amqp = require('amqplib');
const rabbitmqHost = process.env.RABBITMQ_HOST;
const rabbitmqUrl = `amqp://${rabbitmqHost}`;

/*
 * Accemptable image formats
 */
const imageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png'
}

/*
 * Middleware to add a file to the current directory in a folder called uploads
 */
const upload = multer({
  storage: multer.diskStorage({
    destination: `${__dirname}/uploads`,
    filename: (req, file, callback) => {
      const filename = crypto.pseudoRandomBytes(16).toString('hex');
      const extension = imageTypes[file.mimetype];
      callback(null, `${filename}.${extension}`);
    }
  }),
  fileFilter: (req, file, callback) => {
    console.log(`file: ${JSON.stringify(file)}`)
    console.log(`directory: ${__dirname}`)
    console.log(`image type existing: ${!!imageTypes[file.mimetype]}`)
    callback(null, !!imageTypes[file.mimetype]); // !! makes a falsey value false and a truthy value true
  }
});

function savePhotoFile(req, res) {
  if (req.file && req.body && req.body.businessId) {
    try {
      return new Promise((resolve, reject) => {
        const db = getDbReference();
        const bucket = new GridFSBucket(db, { bucketName: 'photos' });
        const metadata = {
          contentType: req.file.mimetype,
          businessId: req.body.businessId,
          caption: req.body.caption
        };
        const uploadStream = bucket.openUploadStream(
          req.file.filename,
          { metadata: metadata }
        );
        fs.createReadStream(req.file.path).pipe(uploadStream).on('error', (err) => {
          reject(err);
        })
          .on('finish', (result) => {
            resolve(result._id);
          });
      });
    } catch (err) {
      next(err);
    }
  } else {
    res.status(400).send({
      err: "Request body needs 'photo' file and 'businessId'"
    })
  }
}

function removeUploadedFile(file) {
  return new Promise((resolve, reject) => {
    fs.unlink(file.path, (err) => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });
}


/*
 * POST /photos - Route to create a new photo.
 */
router.post('/', upload.single('file'), async (req, res) => {
  // check if multer set req.file to something, if not the upload wasn't successful
  if (!req.file) {
    console.log(`couldn't find req.file after upload, file object: ${req.file}`)
    next();
  }
  if (validateAgainstSchema(req.body, PhotoSchema)) {
    console.log(`validated SUCCESSFULLY against schema`)
    try {
      // const id = await insertNewPhoto(req.body)
      // console.log(`didn't error out after insertNewPhoto`)
      // res.status(201).send({
      //   id: id,
      //   links: {
      //     photo: `/photos/${id}`,
      //     business: `/businesses/${req.body.businessId}`
      //   }
      const photo = {
        contentType: req.file.mimetype,
        filename: req.file.filename,
        path: req.file.path,
        userId: req.body.userId
      };
      const id = await savePhotoFile(req, res);
      await removeUploadedFile(req.file);
      res.status(200).send({ id: id });


      // // now send a message to the RabbitMQ server
      // try {
      //   console.log('here we are sending a message to RabbitMQ')
      //   const connection = await amqp.connect(rabbitmqUrl);
      //   const channel = await connection.createChannel();
      //   await channel.assertQueue('imageCompression');
      //   channel.sendToQueue('imageCompression', Buffer.from(PHOTO)); /// not implemented yet
      //   setTimeout(() => { connection.close(); }, 500);
      // } catch (err) {
      //   console.error(err);
      // }

    } catch (err) {
      console.log(`errored out on attempted insertion into database, error: ${err}`)
      console.error(err)
      res.status(500).send({
        error: "Error inserting photo into DB.  Please try again later."
      })
    }
  } else {
    console.log(`NOT validated successfully against schema`)
    res.status(400).send({
      error: "Request body is not a valid photo object"
    })
  }
})

/*
 * GET /photos/{id} - Route to fetch info about a specific photo.
 */
router.get('/:id', async (req, res, next) => {
  try {
    const photo = await getPhotoById(req.params.id)
    if (photo) {
      res.status(200).send(photo)
    } else {
      next()
    }
  } catch (err) {
    console.error(err)
    res.status(500).send({
      error: "Unable to fetch photo.  Please try again later."
    })
  }
})

module.exports = router
