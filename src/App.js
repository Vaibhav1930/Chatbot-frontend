import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';
import { io } from 'socket.io-client';

// ✅ Basic configuration
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';
const MY_USER_ID = parseInt(process.env.REACT_APP_MY_USER_ID || '10', 10); // ← make sure matches your Supabase user ID

export default function App() {
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [attachment, setAttachment] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const socketRef = useRef(null);
  const messagesRef = useRef(null);

  // ✅ Socket setup
  useEffect(() => {
    if (!socketRef.current) {
      socketRef.current = io(API_URL, { transports: ['websocket'] });

      socketRef.current.on('connect', () => {
        socketRef.current.emit('join', { userId: MY_USER_ID });
      });

      socketRef.current.on('new_message', (msg) => {
        const otherId = msg.sender_id === MY_USER_ID ? msg.receiver_id : msg.sender_id;
        setMessages((prev) => {
          if (selectedUser && otherId === selectedUser.id) {
            const alreadyExists = prev.some((m) => m.id === msg.id);
            return alreadyExists ? prev : [...prev, msg];
          }
          return prev;
        });
      });
    }

    return () => {
      socketRef.current?.off('new_message');
    };
  }, [selectedUser]);

  // ✅ Scroll to bottom when messages update
  useEffect(() => {
    if (messagesRef.current) {
      messagesRef.current.scrollTop = messagesRef.current.scrollHeight;
    }
  }, [messages]);

  // ✅ Fetch users
  async function fetchUsers(q) {
    try {
      const res = await axios.get(`${API_URL}/api/users`, { params: { search: q } });
      setUsers(res.data);
    } catch (err) {
      console.error('Failed to fetch users', err);
    }
  }

  useEffect(() => {
    fetchUsers('');
  }, []);

  // ✅ Open conversation
  async function openConversation(user) {
    setSelectedUser(user);
    setMessages([]);
    try {
      const res = await axios.get(`${API_URL}/api/messages/${user.id}`, {
        params: { myUserId: MY_USER_ID },
      });
      setMessages(res.data);
    } catch (err) {
      console.error('Failed to fetch conversation', err);
    }
  }

  // ✅ File Upload to backend (Supabase integrated)
  async function handleFileUpload(e) {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploading(true);
      const res = await axios.post(`${API_URL}/api/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
        onUploadProgress: (progressEvent) => {
          const percent = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percent);
        },
      });
      setAttachment({ url: res.data.url, name: file.name });
      setUploading(false);
      setUploadProgress(0);
    } catch (err) {
      console.error('File upload failed:', err);
      setUploading(false);
    }
  }

  // ✅ Send message
  async function sendMessage() {
    if (!selectedUser || (!input.trim() && !attachment)) return;

    const payload = {
      sender_id: MY_USER_ID,
      receiver_id: selectedUser.id,
      content: input.trim(),
      attachment_url: attachment ? attachment.url : null,
    };

    try {
      await axios.post(`${API_URL}/api/messages`, payload);
      setMessages((prev) => [
        ...prev,
        {
          id: Date.now(),
          sender_id: MY_USER_ID,
          receiver_id: selectedUser.id,
          content: input.trim(),
          attachment_url: attachment ? attachment.url : null,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput('');
      setAttachment(null);
    } catch (err) {
      console.error('Failed to send message', err);
    }
  }

  // ✅ Format time
  function formatTime(ts) {
    const date = new Date(ts);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return (
    <div className="app">
      {/* --- Sidebar --- */}
      <div className="sidebar">
        <h3>Members</h3>
        <input
          placeholder="Search members..."
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            fetchUsers(e.target.value);
          }}
        />
        <div style={{ marginTop: 12 }}>
          {users.map((u) => (
            <div
              key={u.id}
              className={`user-item ${selectedUser?.id === u.id ? 'active' : ''}`}
              onClick={() => openConversation(u)}
            >
              <div><strong>{u.name}</strong></div>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{u.email}</div>
            </div>
          ))}
        </div>
      </div>

      {/* --- Chat --- */}
      <div className="chat">
        {/* Chat header */}
        <div className="chat-header">
          {selectedUser ? (
            <div>
              <strong>{selectedUser.name}</strong>
              <div style={{ fontSize: 12, color: '#6b7280' }}>{selectedUser.email}</div>
            </div>
          ) : (
            <div>Select a user to start chat</div>
          )}
        </div>

        {/* Messages */}
        <div className="messages" ref={messagesRef}>
          {messages.map((m) => (
            <div key={m.id} className={`message ${m.sender_id === MY_USER_ID ? 'me' : 'them'}`}>
              <div className="bubble">
                {/* Message Text */}
                {m.content && <div className="text">{m.content}</div>}

                {/* Attachments */}
                {m.attachment_url && (
                  <>
                    {m.attachment_url.match(/\.(jpg|jpeg|png|gif|webp)$/i) ? (
                      <img src={m.attachment_url} alt="attachment" className="image-attachment" />
                    ) : (
                      <a href={m.attachment_url} target="_blank" rel="noopener noreferrer" className="file-bubble">
                        <span className="file-icon">📄</span>
                        <span className="file-name">
                          {m.attachment_url.split('/').pop().substring(0, 25)}...
                        </span>
                      </a>
                    )}
                  </>
                )}

                {/* Timestamp */}
                <div className="timestamp">{formatTime(m.timestamp)}</div>
              </div>
            </div>
          ))}
        </div>

        {/* Uploading progress */}
        {uploading && (
          <div className="upload-progress">
            Uploading... {uploadProgress}%
          </div>
        )}

        {/* Input row */}
        <div className="input-row">
          <label htmlFor="file-input" className="attach-label">📎</label>
          <input id="file-input" type="file" style={{ display: 'none' }} onChange={handleFileUpload} />

          <input
            placeholder="Type a message..."
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') sendMessage();
            }}
          />
          <button className="btn" onClick={sendMessage}>Send</button>
        </div>
      </div>
    </div>
  );
}