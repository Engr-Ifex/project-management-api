import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Create the upload directory if it doesn't exist
const avatarUploadPath = path.join(process.cwd(), 'src', 'uploads', 'avatars');

if (!fs.existsSync(avatarUploadPath)) {
  fs.mkdirSync(avatarUploadPath, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, avatarUploadPath);
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;

    const extension = path.extname(file.originalname);

    cb(null, `avatar-${uniqueSuffix}${extension}`);
  },
});

// Accept only image files
const fileFilter = (req, file, cb) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];

  if (allowedMimeTypes.includes(file.mimetype)) {
    return cb(null, true);
  }

  cb(new Error('Only JPEG, JPG, PNG and WEBP images are allowed.'));
};

// Create upload middleware
const upload = multer({
  storage,

  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },

  fileFilter,
});

export default upload;
