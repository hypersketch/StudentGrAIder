import React, { useState, useEffect } from 'react';
import Button from 'react-bootstrap/Button';
import Form from 'react-bootstrap/Form';
import Card from 'react-bootstrap/Card';
import Col from 'react-bootstrap/Col';
import Row from 'react-bootstrap/Row';
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import getUserInfo from '../../utilities/decodeJwt';

const EditUserPage = () => {

  const url = `${process.env.REACT_APP_BACKEND_SERVER_URI}/user/editUser`;
  const navigate = useNavigate();

  const [formErrors, setFormErrors] = useState({})
  const validateForm = () => {
    const { username, email, password } = formData
    const errors = {}
    if (!username || username === '') errors.name = 'Input a valid username'
    else if (username.length < 6) errors.name = 'Username must be at least 6 characters'
    if (!email || email === '') errors.email = 'Input a valid email address'
    if (!/\S+@\S+\.\S+/.test(email)) errors.email = 'Input a valid email address'
    if (!password || password === '') errors.password = 'Input a valid password'
    else if (password.length < 8) errors.password = 'Password must be at least 8 characters'
    return errors
  }

  const [formData, setFormData] = useState({ userId: "", username: "", email: "", password: "" })
  useEffect(() => {
    setFormData({ userId: getUserInfo().id })
  }, [])

  const handleChange = ({ currentTarget: input }) => {
    setFormData({ ...formData, [input.id]: input.value });
    if (!!formErrors[input]) setFormErrors({ ...formErrors, [input]: null })
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const errors = validateForm()
    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
    } else {
      try {
        const { data: res } = await axios.post(url, formData);
        localStorage.setItem("accessToken", res.accessToken);
        navigate("/privateuserprofile");
      } catch (error) {
        if (error.response && error.response.status !== 409 &&
          error.response.status >= 400 && error.response.status <= 500) {
          window.alert(error.response.data.message);
        }
        if (error.response && error.response.status === 409) {
          setFormErrors({ name: "Username is taken, pick another" })
        }
      }
    }
  }

  const handleCancel = () => {
    navigate("/privateuserprofile");
  }

  return (
    <div>
      <Card body outline color="success" className="mx-1 my-2" style={{ width: '30rem' }}>
        <Card.Title>Edit User Information</Card.Title>
        <Card.Body>
          <Form>

            <Form.Group className="mb-3" controlId="formName">
              <Form.Label>Username</Form.Label>
              <Form.Control type="text" placeholder="Enter new username"
                id="username"
                value={formData.username}
                onChange={handleChange}
                isInvalid={!!formErrors.name}
              />
              <Form.Control.Feedback type='invalid'>
                {formErrors.name}
              </Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="formEmail">
              <Form.Label>Email address</Form.Label>
              <Form.Control type="text" placeholder="Enter new email address"
                id="email"
                value={formData.email}
                onChange={handleChange}
                isInvalid={!!formErrors.email}
              />
              <Form.Control.Feedback type='invalid'>
                {formErrors.email}
              </Form.Control.Feedback>
            </Form.Group>

            <Form.Group className="mb-3" controlId="formPassword">
              <Form.Label>Password</Form.Label>
              <Form.Control type="text" placeholder="Enter new password"
                id="password"
                value={formData.password}
                onChange={handleChange}
                isInvalid={!!formErrors.password}
              />
              <Form.Control.Feedback type='invalid'>
                {formErrors.password}
              </Form.Control.Feedback>
            </Form.Group>

            <Row>
              <Col>
                <Button variant="primary" type="submit" onClick={handleSubmit}>
                  Submit
                </Button>
              </Col>
              <Col>
                <Button variant="primary" type="cancel" onClick={handleCancel}>
                  Cancel
                </Button>
              </Col>
            </Row>

          </Form>
        </Card.Body>
      </Card>
    </div>
  )
}

export default EditUserPage;
