import dotenv from 'dotenv';

dotenv.config();

export default {
  port: Number(process.env.PORT),
  nodeEnv: process.env.NODE_ENV,
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN,
  cookieMaxAge: Number(process.env.COOKIE_MAX_AGE),
  mongoUri: process.env.MONGODB_URI,
  bcryptSaltRounds: Number(process.env.BCRYPT_SALT_ROUNDS),
};
