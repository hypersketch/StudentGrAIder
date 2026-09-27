const express = require("express");
const router = express.Router();
const z = require("zod");
const bcrypt = require("bcrypt");

const userModel = require("../models/userModel");

router.get("/getUserById", async (req, res) => {
  var { userId } = req.body;

  userModel.findById(userId, function (err, user) {
    if (err) {
      console.log(err);
    }
    if (user==null) {
      res.status(404).send("userId does not exist.");
    } 
    else {
      return res.json(user);
    }
  });
});

module.exports = router;
