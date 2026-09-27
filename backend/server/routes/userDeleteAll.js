const express = require("express");
const router = express.Router();
const userModel = require('../models/userModel')

router.post('/deleteAll', async (req, res) => {
    const deleteResult = await userModel.deleteMany();
    return res.json(deleteResult)
  })

  module.exports = router;