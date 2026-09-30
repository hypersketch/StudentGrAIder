const mongoose = require("mongoose");
const { QUESTION_TYPES } = require('./quizModel');

// One answer per question. Which fields are used depends on the type:
//   multiple_choice / true_false: selectedOptionIndex, auto-graded on submit (isCorrect + pointsAwarded)
//   open_response:                responseText, graded by the AI (aiScore/aiFeedback) and
//                                 optionally overridden by the professor (professorScore/professorFeedback)
const answerSchema = new mongoose.Schema(
  {
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    type: {
      type: String,
      enum: QUESTION_TYPES,
      required: true,
    },

    // multiple_choice + true_false
    selectedOptionIndex: {
      type: Number,
      min: 0,
    },
    isCorrect: Boolean,

    // open_response
    responseText: {
      type: String,
      trim: true,
    },
    aiScore: {
      type: Number,
      min: 0,
    },
    aiFeedback: String,
    professorScore: {
      type: Number,
      min: 0,
    },
    professorFeedback: String,
    reviewedAt: Date,

    // Final points for this question. For open_response this is professorScore
    // once reviewed, otherwise aiScore.
    pointsAwarded: {
      type: Number,
      min: 0,
      default: 0,
    },
  },
  { _id: false }
);

const attemptSchema = new mongoose.Schema(
  {
    quizId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'quizzes',
      required: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'users',
      required: true,
    },
    // in_progress: started, not submitted
    // submitted:   answers locked in, open responses waiting on the AI
    // graded:      every answer has a score
    status: {
      type: String,
      enum: ['in_progress', 'submitted', 'graded'],
      default: 'in_progress',
    },
    startedAt: {
      type: Date,
      default: Date.now,
    },
    submittedAt: Date,
    totalScoreAwarded: {
      type: Number,
      min: 0,
      default: 0,
    },
    totalPointsPossible: {
      type: Number,
      min: 0,
      required: true,
    },
    answers: [answerSchema],
  },
  { collection: "attempts" }
);

attemptSchema.index({ quizId: 1, studentId: 1 });
attemptSchema.index({ studentId: 1 });

module.exports = mongoose.model('attempts', attemptSchema)
