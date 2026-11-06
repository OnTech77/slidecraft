/** Browser stand-in for multer: server/utils/errors.js only checks for its error class. */
class MulterError extends Error {}

export default { MulterError };
