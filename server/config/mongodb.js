import mongoose from "mongoose";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const connectDB = async () => {
  if (!process.env.MONGO_URI) {
    console.error("MongoDB not configured: MONGO_URI not found in environment variables");
    return; // don't exit - let the server still run for simulation
  }

  // MongoDB may still be starting when this container comes up, and mongoose does
  // not retry a failed first connection by itself - so retry here.
  const attempts = Number(process.env.MONGO_CONNECT_ATTEMPTS || 10);
  for (let i = 1; i <= attempts; i++) {
    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      console.log(" MongoDB connected successfully");
      return;
    } catch (error) {
      console.error(`MongoDB connection failed (attempt ${i}/${attempts}): ${error.message}`);
      if (i < attempts) await sleep(2000);
    }
  }
  console.error("MongoDB unavailable - continuing without it");
};

export default connectDB;