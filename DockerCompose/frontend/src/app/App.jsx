import { useState, useEffect } from "react";
import axios from "axios";
import "./App.css";

function App() {
  const [users, setUsers] = useState([]);

  useEffect(() => {
    axios.get("/api/users").then((response) => {
      // Handle both array and object responses
      const data = Array.isArray(response.data) ? response.data : response.data.users || [];
      setUsers(data);

      console.log(data);
      
    });
  }, []);

  return (
    <>
      <div>
        <h1>Users</h1>
        <ul>
          {users.map((user) => {
            return <li key={user.id}>{user.name}</li>;
          })}
        </ul>
      </div>
    </>
  );
}

export default App;
