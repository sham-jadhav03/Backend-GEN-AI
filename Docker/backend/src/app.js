import express from 'express';

const app = express();

app.get('/', (req, res) => {
    res.send('Hello, World!');
})

app.get('/api/data', (req, res) => {
    const data = {
        name: 'AgenticDev',
        message: 'This is some API data'
    }
    res.json(data);
});

app.get('/api/user', (req, res) => {
    const user = {
        id: 3,
        name: 'John Doe',
        email: 'john.doe@example.com'
    }
    res.json(user);
});

export default app;