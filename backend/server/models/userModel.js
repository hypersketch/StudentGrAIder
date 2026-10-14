const mongoose = require("mongoose");

// Names are unique so a professor can tell students apart when adding them to a class.
// Comparisons ignore case ("john smith" = "John Smith"), and extra spaces are collapsed on save.
const NAME_COLLATION = { locale: 'en', strength: 2 };
const normalizeName = (name) => (typeof name === 'string' ? name.trim().replace(/\s+/g, ' ') : name);

// id is Mongo's built-in _id
const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      set: normalizeName,
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
    // Password reset: a hash of the emailed one-time token (never the token itself) and when it stops working
    resetTokenHash: String,
    resetTokenExpires: Date,
  },
  { collection: "users", timestamps: { createdAt: true, updatedAt: false } }
);

// Never send the password hash or reset token back in API responses
userSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.password;
    delete ret.resetTokenHash;
    delete ret.resetTokenExpires;
    return ret;
  },
});

userSchema.index({ name: 1 }, { unique: true, collation: NAME_COLLATION });

const userModel = mongoose.model('users', userSchema)

// The name index can't be built while the database already holds duplicate names. Say so instead of failing silently.
userModel.on('index', (err) => {
  if (err) console.log(`Could not create the users indexes (are there duplicate names?): ${err.message}`)
})

module.exports = userModel
module.exports.NAME_COLLATION = NAME_COLLATION
module.exports.normalizeName = normalizeName
