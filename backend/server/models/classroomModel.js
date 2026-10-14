const mongoose = require("mongoose");

// Most students a class can hold unless the professor changes it
const DEFAULT_STUDENT_LIMIT = 25;
const MAX_STUDENT_LIMIT = 1000;

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
    // Students who asked to join and are waiting for the professor to approve or decline
    pendingStudents: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
    }],
    // Approving a join request fails once students reaches this
    studentLimit: {
      type: Number,
      min: 1,
      max: MAX_STUDENT_LIMIT,
      default: DEFAULT_STUDENT_LIMIT,
    },
  },
  { collection: "classrooms", timestamps: { createdAt: true, updatedAt: false } }
);

// A professor can't have two classes with the same course code
classroomSchema.index({ professorId: 1, courseCode: 1 }, { unique: true });
// Fast lookup of "which classes is this student in"
classroomSchema.index({ students: 1 });

module.exports = mongoose.model('classrooms', classroomSchema)
module.exports.DEFAULT_STUDENT_LIMIT = DEFAULT_STUDENT_LIMIT
module.exports.MAX_STUDENT_LIMIT = MAX_STUDENT_LIMIT
