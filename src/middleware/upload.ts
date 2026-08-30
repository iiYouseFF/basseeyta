import multer from 'multer';

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'image/gif'];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error(`MIME type ${file.mimetype} not allowed`));
  },
});
