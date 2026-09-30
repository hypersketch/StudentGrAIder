const mongoose = require("mongoose");

const classroomSchema = new mongoose.Schema(
  {
    className: {
      type: String,
      required: true,
      trim: true,
    },
    courseCode: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    professorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    students: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    }],
  },
  { collection: "classrooms", timestamps: { createdAt: true, updatedAt: false } }
);

// A professor can't have two classes with the same course code
classroomSchema.index({ professorId: 1, courseCode: 1 }, { unique: true });
// Fast lookup of "which classes is this student in"
classroomSchema.index({ students: 1 });

module.exports = mongoose.model('classrooms', classroomSchema)
