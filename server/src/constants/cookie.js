import env from '../config/env.js';
export const getCookieOptions = () => ({
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict',
  maxAge: Number(env.cookieMaxAge),
});
