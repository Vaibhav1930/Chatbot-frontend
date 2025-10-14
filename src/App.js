import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

// Basic configuration via environment variables:
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
// For demo purposes the client uses a fixed user id. In real integration, the main app provides the logged in user's id.
const MY_USER_ID = parseInt(process.env.REACT_APP_MY_USER_ID || '1', 10);

export default function App() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const socketRef = useRef(null);
  const messagesRef = useRef(null);

  useEffect(() => {
  // Only initialize socket once
  if (!socketRef.current) {
    socketRef.current = io(API_URL, { transports: ['websocket'] });

    socketRef.current.on('connect', () => {
      socketRef.current.emit('join', { userId: MY_USER_ID });
    });

    socketRef.current.on('new_message', (msg) => {
      const otherId = (msg.sender_id === MY_USER_ID) ? msg.receiver_id : msg.sender_id;
      // Only append if message belongs to current chat
      setMessages((prev) => {
        if (selectedUser && otherId === selectedUser.id) {
          // Prevent duplicates by checking ID
          const alreadyExists = prev.some((m) => m.id === msg.id);
          return alreadyExists ? prev : [...prev, msg];
        }
        return prev;
      });
    });
  }

  return () => {
    // do NOT disconnect the socket entirely — just clean listeners
    socketRef.current?.off('new_message');
  };
}, [selectedUser]);
; // we include selectedUser to allow live updates when switching conversations

  useEffect(() => {
    // scroll to bottom when messages change
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  async function fetchUsers(q) {
    try {
      const res = await axios.get(`${API_URL}/api/users`, { params: { search: q } });
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  }
  // 👇 Add this new useEffect after fetchUsers()
useEffect(() => {
  // Fetch all users when the app first loads
  fetchUsers('');
}, []);


  async function openConversation(user) {
    setSelectedUser(user);
    setMessages([]);
    try {
      const res = await axios.get(`${API_URL}/api/messages/${user.id}`, { params: { myUserId: MY_USER_ID } });
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch conversation', err);
    }
  }

  async function sendMessage() {
    if (!selectedUser || !input.trim()) return;
    const payload = {
      sender_id: MY_USER_ID,
      receiver_id: selectedUser.id,
      content: input.trim()
    };
    try {
      await axios.post(`${API_URL}/api/messages`, payload);
      // optimistic UI - push message locally
      setMessages((prev) => [...prev, {
        id: Date.now(),
        sender_id: MY_USER_ID,
        receiver_id: selectedUser.id,
        content: input.trim(),
        timestamp: new Date().toISOString()
      }]);
      setInput('');
    } catch (err) {
      console.error('Failed to send message', err);
    }
  }

  return (
    <div className="app">
      <div className="sidebar">
        <h3>Members</h3>
        <input
          placeholder="Search members..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); fetchUsers(e.target.value); }}
        />
        <div style={{ marginTop: 12 }}>
          {users.map(u => (
            <div key={u.id} className="user-item" onClick={() => openConversation(u)}>
              <div><strong>{u.name}</strong></div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{u.email}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="chat">
        <div style={{ padding: 16, borderBottom: '1px solid #e5e7eb', background: '#fff' }}>
          {selectedUser ? (
            <div>
              <strong>{selectedUser.name}</strong>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{selectedUser.email}</div>
            </div>
          ) : (
            <div>Select a user to start chat</div>
          )}
        </div>

        <div className="messages" ref={messagesRef}>
          {messages.map(m => (
            <div key={m.id} className={`message ${m.sender_id === MY_USER_ID ? 'me' : 'them'}`}>
              <div style={{ fontSize: 14 }}>{m.content}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop:6 }}>{new Date(m.timestamp).toLocaleString()}</div>
            </div>
          ))}
        </div>

        <div className="input-row">
          <input placeholder="Type a message..." value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={(e)=>{ if(e.key === 'Enter') sendMessage(); }} />
          <button className="btn" onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}
