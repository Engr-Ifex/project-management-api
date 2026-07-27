import mongoose from 'mongoose';

const connectDB = async () => {
  try {
    const connection = await mongoose.connect(process.env.MONGODB_URI);

    console.log('✅ MongoDB connected successfully');
    console.log(`📂 Database: ${connection.connection.name}`);
    console.log(`🌐 Host: ${connection.connection.host}`);
  } catch (error) {
    console.error('❌ MongoDB connection failed');
    console.error(`Error: ${error.message}`);

    process.exit(1);
  }
};

export default connectDB;
