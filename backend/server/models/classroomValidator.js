const z = require('zod')

//validates when a professor creates a class
const classroomValidation = data => {
  const classroomValidationSchema = z.object({
    className: z.string().trim().min(1, 'Class name is required'),
    courseCode: z.string().trim().min(1, 'Course code is required'),
  });

  return classroomValidationSchema.safeParse(data)
};

module.exports.classroomValidation = classroomValidation;
