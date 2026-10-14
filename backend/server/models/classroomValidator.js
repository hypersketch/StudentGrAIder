const z = require('zod')
const { MAX_STUDENT_LIMIT } = require('./classroomModel')

const studentLimit = z.coerce.number({ invalid_type_error: 'Student limit must be a number' })
  .int('Student limit must be a whole number')
  .min(1, 'Student limit must be at least 1')
  .max(MAX_STUDENT_LIMIT, `Student limit can't be more than ${MAX_STUDENT_LIMIT}`);

//validates when a professor creates a class (studentLimit is optional and defaults to 25)
const classroomValidation = data => {
  const classroomValidationSchema = z.object({
    className: z.string().trim().min(1, 'Class name is required'),
    courseCode: z.string().trim().min(1, 'Course code is required'),
    studentLimit: studentLimit.optional(),
  });

  return classroomValidationSchema.safeParse(data)
};

//validates when a professor changes a class's settings
const classroomSettingsValidation = data => {
  const classroomSettingsSchema = z.object({
    studentLimit,
  });

  return classroomSettingsSchema.safeParse(data)
};

module.exports.classroomValidation = classroomValidation;
module.exports.classroomSettingsValidation = classroomSettingsValidation;
