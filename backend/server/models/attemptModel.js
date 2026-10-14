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

    // Copy of the question as the student saw it, saved on submit. Later edits to the quiz
    // (new questions, deleted ones, changed points) don't change a submitted attempt.
    text: String,
    points: {
      type: Number,
      min: 0,
    },
    options: {
      type: [String],
      default: undefined,
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
    // 1 for the first try, 2 for the second... up to the quiz's maxAttempts
    attemptNumber: {
      type: Number,
      min: 1,
      default: 1,
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
    // Set by the server when the attempt starts: the end of the time limit or the due date, whichever is first.
    // Answers sent after it (plus a short grace period) are ignored; the last ones saved before it are graded.
    deadlineAt: Date,
    // Answers saved while the student works, so the server has them if time runs out. Cleared on submit.
    savedAnswers: {
      type: [new mongoose.Schema({
        questionId: String,
        selectedOptionIndex: Number,
        responseText: String,
      }, { _id: false })],
      default: undefined,
    },
    // True when time ran out and the server submitted the saved answers itself
    autoSubmitted: Boolean,
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

// Also stops two quick "Start" clicks from creating the same try twice
attemptSchema.index({ quizId: 1, studentId: 1, attemptNumber: 1 }, { unique: true });
attemptSchema.index({ studentId: 1 });

module.exports = mongoose.model('attempts', attemptSchema)
