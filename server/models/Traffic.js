import mongoose from "mongoose";

const trafficSchema = new mongoose.Schema({
  state: {
    type: [Number],
    required: true
  },
  action: {
    type: String,
    required: true
  },
  reward: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ["RL", "FIXED"],
    required: true
  }
}, { timestamps: true });






const Traffic = mongoose.model("Traffic", trafficSchema);

export default Traffic;