const z = require('zod')

//validates when new user creates an account
const userValidation = data => {
  const registerValidationSchema = z.object({
    name: z.string().trim().min(2, 'Name must be 2 characters or more'),
    email: z.string().email('Please Input a valid email'),
    password: z.string().min(8, 'Password must be 8 or more characters').trim(),
    role: z.enum(['student', 'professor'], { errorMap: () => ({ message: 'Choose either Student or Professor' }) }),
  });

  return registerValidationSchema.safeParse(data)
};

//validate user request when logging in
const userLoginValidation = data => {
  const loginValidationSchema = z.object({
    email: z.string().email('Please Input a valid email'),
    password: z.string().min(8, 'Password must be 8 or more characters').trim(),
  });
  return loginValidationSchema.safeParse(data)
};

//validate a "forgot password" request
const forgotPasswordValidation = data => {
  const forgotPasswordSchema = z.object({
    email: z.string().email('Please Input a valid email'),
  });
  return forgotPasswordSchema.safeParse(data)
};

//validate choosing a new password from a reset link
const resetPasswordValidation = data => {
  const resetPasswordSchema = z.object({
    token: z.string().min(1, 'This reset link is invalid or has expired'),
    password: z.string().min(8, 'Password must be 8 or more characters'),
  });
  return resetPasswordSchema.safeParse(data)
};

module.exports.userValidation = userValidation;
module.exports.userLoginValidation = userLoginValidation;
module.exports.forgotPasswordValidation = forgotPasswordValidation;
module.exports.resetPasswordValidation = resetPasswordValidation;
