const mongoose = require("mongoose");

const QUESTION_TYPES = ['multiple_choice', 'true_false', 'open_response'];

// Rules per type:
//   multiple_choice: options (2+), correctOptionIndex points into options
//   true_false:      options are always ['True', 'False'], correctOptionIndex is 0 or 1
//   open_response:   no options / correctOptionIndex, optional sampleAnswer, graded by the AI + professor
const questionSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      default: () => new mongoose.Types.ObjectId(),
    },
    type: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    options: {
      type: [String],
      default: undefined,
    },
    correctOptionIndex: {
      type: Number,
      min: 0,
    },
    // open_response only (optional): what a full-credit answer looks like.
    // Sent to the AI grader as the reference to compare the student's answer against.
    sampleAnswer: {
      type: String,
      trim: true,
    },
    points: {
      type: Number,
      required: true,
      min: 0,
      default: 1,
    },
  },
  { _id: false }
);

questionSchema.pre('validate', function (next) {
  if (this.type !== 'open_response') {
    this.sampleAnswer = undefined;
  }

  if (this.type === 'true_false') {
    this.options = ['True', 'False'];
  }

  if (this.type === 'open_response') {
    this.options = undefined;
    this.correctOptionIndex = undefined;
    return next();
  }

  if (!this.options || this.options.length < 2) {
    return next(new Error('Multiple choice questions need at least 2 options'));
  }
  if (this.correctOptionIndex == null || this.correctOptionIndex >= this.options.length) {
    return next(new Error('correctOptionIndex must point to one of the options'));
  }
  next();
});

const quizSchema = new mongoose.Schema(
  {
    classroomId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'classrooms',
      required: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    // null/undefined = no time limit
    timeLimitMinutes: {
      type: Number,
      min: 1,
    },
    questions: [questionSchema],
  },
  { collection: "quizzes", timestamps: { createdAt: true, updatedAt: false } }
);

quizSchema.index({ classroomId: 1 });

// Sum of every question's points, used to fill attempts.totalPointsPossible
quizSchema.virtual('totalPoints').get(function () {
  return this.questions.reduce((sum, q) => sum + q.points, 0);
});

module.exports = mongoose.model('quizzes', quizSchema)
module.exports.QUESTION_TYPES = QUESTION_TYPES
