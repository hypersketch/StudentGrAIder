import React from "react";
// We use Route in order to define the different routes of our application
import { Navigate, Route, Routes } from "react-router-dom";
import './index.css';

// We import all the components we need in our app
import HomePage from "./components/pages/homePage";
import Login from "./components/pages/loginPage";
import Signup from "./components/pages/registerPage";
import QuizMakerPage from "./components/pages/quizMakerPage";
import { createContext, useState, useEffect } from "react";
import getUserInfo from "./utilities/decodeJwt";

export const UserContext = createContext();

const App = () => {
  const [user, setUser] = useState();

  useEffect(() => {
    setUser(getUserInfo());
  }, []);

  return (
    <UserContext.Provider value={user}>
      <Routes>
        <Route exact path="/" element={<HomePage />} />
        {/* Old address for the home page, kept so existing links still work */}
        <Route exact path="/home" element={<Navigate to="/" replace />} />
        {/* Login and sign up open as overlays on top of the home page */}
        <Route exact path="/login" element={<><HomePage /><Login /></>} />
        <Route exact path="/signup" element={<><HomePage /><Signup /></>} />
        <Route exact path="/classes/:classId/quizzes/new" element={<QuizMakerPage />} />
        <Route exact path="/classes/:classId/quizzes/:quizId" element={<QuizMakerPage />} />
      </Routes>
    </UserContext.Provider>
  );
};

export default App
