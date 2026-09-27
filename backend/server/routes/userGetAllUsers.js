const express = require("express");
const router = express.Router();
const userModel = require('../models/userModel')

router.get('/getAll', async (req, res) => {
    const users = await userModel.find();
    return res.json(users)
  })

  module.exports = router;