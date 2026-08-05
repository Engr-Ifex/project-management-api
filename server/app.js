import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import path from 'path';

import indexRoutes from './src/routes/index.routes.js';
import errorHandler from './src/middlewares/error.middleware.js';

const app = express();

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(cookieParser());
app.use('/uploads', express.static(path.join(process.cwd(), 'src', 'uploads')));

// Routes
app.use('/api/v1', indexRoutes);

app.use(errorHandler);

export default app;
