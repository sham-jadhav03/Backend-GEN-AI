import { useEffect, useState } from "react";
import "./App.css";
import axios from "axios";

function App() {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    axios
      .get("/api/users")
      .then((response) => {
        const usersData = response.data?.data;
        setUsers(Array.isArray(usersData) ? usersData : []);
      })
      .catch(() => {
        setError("Unable to load users.");
      });
  }, []);

  return (
    <>
      <div className="app">
        <h1>Users</h1>
        {error && <p>{error}</p>}
        <ul>
          {users.map((user) => (
            <li key={user.id}>{user.name}</li>
          ))}
        </ul>
      </div>
    </>
  );
}

export default App;
