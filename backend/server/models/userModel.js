const mongoose = require("mongoose");

// id is Mongo's built-in _id
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    // bcrypt hash, never the plain password
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ['student', 'professor'],
      required: true,
    },
  },
  { collection: "users", timestamps: { createdAt: true, updatedAt: false } }
);

// Never send the password hash back in API responses
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    return ret;
  },
});

module.exports = mongoose.model('users', userSchema)
