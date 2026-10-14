import React from "react";
// We use Route in order to define the different routes of our application
import { Navigate, Route, Routes } from "react-router-dom";
import './index.css';

// We import all the components we need in our app
import HomePage from "./components/pages/homePage";
import Login from "./components/pages/loginPage";
import Signup from "./components/pages/registerPage";
import QuizMakerPage from "./components/pages/quizMakerPage";
import TakeQuizPage from "./components/pages/takeQuizPage";
import GradeQuizPage from "./components/pages/gradeQuizPage";
import GradebookPage from "./components/pages/gradebookPage";
import ForgotPassword from "./components/pages/forgotPasswordPage";
import ResetPassword from "./components/pages/resetPasswordPage";
import { createContext, useState, useEffect } from "react";
import getUserInfo from "./utilities/decodeJwt";
import { startSessionKeepAlive } from "./utilities/session";

export const UserContext = createContext();

const App = () => {
  const [user, setUser] = useState();

  useEffect(() => {
    setUser(getUserInfo());
  }, []);

  // Keeps active users logged in past the 1-hour login limit (see utilities/session.js)
  useEffect(() => startSessionKeepAlive(), []);

  return (
    <UserContext.Provider value={user}>
      <Routes>
        <Route exact path="/" element={<HomePage />} />
        {/* Old address for the home page, kept so existing links still work */}
        <Route exact path="/home" element={<Navigate to="/" replace />} />
        {/* Login and sign up open as overlays on top of the home page */}
        <Route exact path="/login" element={<><HomePage /><Login /></>} />
        <Route exact path="/signup" element={<><HomePage /><Signup /></>} />
        <Route exact path="/forgot-password" element={<><HomePage /><ForgotPassword /></>} />
        <Route exact path="/reset-password" element={<><HomePage /><ResetPassword /></>} />
        <Route exact path="/classes/:classId/gradebook" element={<GradebookPage />} />
        <Route exact path="/classes/:classId/quizzes/new" element={<QuizMakerPage />} />
        <Route exact path="/classes/:classId/quizzes/:quizId" element={<QuizMakerPage />} />
        <Route exact path="/classes/:classId/quizzes/:quizId/take" element={<TakeQuizPage />} />
        <Route exact path="/classes/:classId/quizzes/:quizId/grade" element={<GradeQuizPage />} />
      </Routes>
    </UserContext.Provider>
  );
};

export default App
