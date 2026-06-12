const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Database Pool Connection
let pool;

async function connectDatabase() {
  const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'topic_branching',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  };

  try {
    // Try to connect directly to the database
    pool = mysql.createPool(dbConfig);
    // Ping the database to verify credentials
    const connection = await pool.getConnection();
    console.log(`[Success] Connected to MySQL database: "${dbConfig.database}" on ${dbConfig.host}`);
    connection.release();
  } catch (error) {
    console.error('\n================================================================');
    console.error('[DATABASE CONNECTION ERROR]');
    console.error('Failed to connect to MySQL database.');
    console.error(`Host: ${dbConfig.host}`);
    console.error(`User: ${dbConfig.user}`);
    console.error(`Database: ${dbConfig.database}`);
    console.error(`Error details: ${error.message}`);
    console.error('----------------------------------------------------------------');
    console.error('PLEASE MAKE SURE:');
    console.error('1. Your MySQL server is running (e.g., via XAMPP, Laragon, or docker).');
    console.error(`2. You have created the database "${dbConfig.database}"`);
    console.error('   using the instructions in "schema.sql".');
    console.error('3. Your database credentials in ".env" are correct.');
    console.error('================================================================\n');
    
    // Attempt connection to server without database first, to try and auto-create database if possible
    try {
      console.log('Attempting to check/create database automatically...');
      const connectionWithoutDB = await mysql.createConnection({
        host: dbConfig.host,
        user: dbConfig.user,
        password: dbConfig.password
      });
      await connectionWithoutDB.query(`CREATE DATABASE IF NOT EXISTS \`${dbConfig.database}\`;`);
      await connectionWithoutDB.end();
      
      // Retry pool creation with database
      pool = mysql.createPool(dbConfig);
      const connection = await pool.getConnection();
      console.log(`[Success] Database auto-created/verified and connected successfully.`);
      
      // Auto-run schema migrations
      await initializeTables();
      connection.release();
    } catch (dbError) {
      console.error('[Error] Could not auto-create database: ', dbError.message);
      console.log('The application will still run, but API requests will fail until database is ready.');
    }
  }
}

async function initializeTables() {
  try {
    console.log('Verifying database tables...');
    await pool.query(`
      CREATE TABLE IF NOT EXISTS topics (
        id INT AUTO_INCREMENT PRIMARY KEY,
        title VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB;
    `);
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS branches (
        id INT AUTO_INCREMENT PRIMARY KEY,
        topic_id INT NOT NULL,
        parent_id INT DEFAULT NULL,
        title VARCHAR(255) NOT NULL,
        description TEXT DEFAULT NULL,
        is_expanded BOOLEAN DEFAULT TRUE,
        sort_order INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (topic_id) REFERENCES topics(id) ON DELETE CASCADE,
        FOREIGN KEY (parent_id) REFERENCES branches(id) ON DELETE CASCADE
      ) ENGINE=InnoDB;
    `);
    console.log('[Success] Database tables verified.');
  } catch (err) {
    console.error('[Error] Failed to initialize database tables: ', err.message);
  }
}

// ----------------------------------------------------
// API ENDPOINTS
// ----------------------------------------------------

// Middleware helper to check db connection status
const checkDbConnection = (req, res, next) => {
  if (!pool) {
    return res.status(503).json({ 
      error: 'Database is not connected. Please verify MySQL configuration and restart the server.' 
    });
  }
  next();
};

// 1. GET ALL TOPICS
app.get('/api/topics', checkDbConnection, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM topics ORDER BY created_at DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching topics:', error);
    res.status(500).json({ error: 'Failed to fetch topics' });
  }
});

// 2. CREATE A NEW TOPIC
app.post('/api/topics', checkDbConnection, async (req, res) => {
  const { title } = req.body;
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Topic title is required' });
  }
  
  try {
    const [result] = await pool.query('INSERT INTO topics (title) VALUES (?)', [title.trim()]);
    const newTopicId = result.insertId;
    
    // Return the newly created topic
    res.status(201).json({ id: newTopicId, title: title.trim() });
  } catch (error) {
    console.error('Error creating topic:', error);
    res.status(500).json({ error: 'Failed to create topic' });
  }
});

// 3. UPDATE TOPIC TITLE
app.put('/api/topics/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  const { title } = req.body;
  
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Topic title is required' });
  }
  
  try {
    const [result] = await pool.query('UPDATE topics SET title = ? WHERE id = ?', [title.trim(), id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    res.json({ id: Number(id), title: title.trim() });
  } catch (error) {
    console.error('Error updating topic:', error);
    res.status(500).json({ error: 'Failed to update topic' });
  }
});

// 4. DELETE TOPIC
app.delete('/api/topics/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM topics WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    res.json({ message: 'Topic deleted successfully', id: Number(id) });
  } catch (error) {
    console.error('Error deleting topic:', error);
    res.status(500).json({ error: 'Failed to delete topic' });
  }
});

// 5. GET ALL BRANCHES FOR A SPECIFIC TOPIC
app.get('/api/topics/:topicId/branches', checkDbConnection, async (req, res) => {
  const { topicId } = req.params;
  try {
    // Check if topic exists first
    const [topics] = await pool.query('SELECT * FROM topics WHERE id = ?', [topicId]);
    if (topics.length === 0) {
      return res.status(404).json({ error: 'Topic not found' });
    }
    
    // Fetch all branches of the topic
    const [rows] = await pool.query(
      'SELECT * FROM branches WHERE topic_id = ? ORDER BY sort_order ASC, created_at ASC', 
      [topicId]
    );
    res.json(rows);
  } catch (error) {
    console.error('Error fetching branches:', error);
    res.status(500).json({ error: 'Failed to fetch branches' });
  }
});

// 6. CREATE A NEW BRANCH
app.post('/api/branches', checkDbConnection, async (req, res) => {
  const { topic_id, parent_id, title, description } = req.body;
  
  if (!topic_id) {
    return res.status(400).json({ error: 'topic_id is required' });
  }
  if (!title || !title.trim()) {
    return res.status(400).json({ error: 'Branch title is required' });
  }

  try {
    // Get max sort_order to append branch at the end of the siblings list
    const parentVal = parent_id || null;
    const [maxResult] = await pool.query(
      'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM branches WHERE topic_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))',
      [topic_id, parentVal, parentVal]
    );
    const nextSortOrder = maxResult[0].max_order + 1;

    const [result] = await pool.query(
      'INSERT INTO branches (topic_id, parent_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)',
      [topic_id, parentVal, title.trim(), description || '', nextSortOrder]
    );
    
    const newBranch = {
      id: result.insertId,
      topic_id,
      parent_id: parentVal,
      title: title.trim(),
      description: description || '',
      is_expanded: true,
      sort_order: nextSortOrder
    };
    
    res.status(201).json(newBranch);
  } catch (error) {
    console.error('Error creating branch:', error);
    res.status(500).json({ error: 'Failed to create branch' });
  }
});

// 6b. CREATE BULK BRANCHES
app.post('/api/branches/bulk', checkDbConnection, async (req, res) => {
  const { topic_id, parent_id, branches } = req.body;
  
  if (!topic_id) {
    return res.status(400).json({ error: 'topic_id is required' });
  }
  
  if (!Array.isArray(branches) || branches.length === 0) {
    return res.status(400).json({ error: 'branches array is required and cannot be empty' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    const tempIdToDbId = {};
    const createdBranches = [];
    
    for (const item of branches) {
      const { tempId, parentTempId, dbParentId, title } = item;
      
      if (!title || !title.trim()) {
        throw new Error('Branch title cannot be empty');
      }
      
      let resolvedParentId = null;
      if (parentTempId && tempIdToDbId[parentTempId]) {
        resolvedParentId = tempIdToDbId[parentTempId];
      } else if (dbParentId) {
        resolvedParentId = dbParentId;
      } else if (parent_id) {
        resolvedParentId = parent_id;
      }
      
      const parentVal = resolvedParentId || null;
      const [maxResult] = await connection.query(
        'SELECT COALESCE(MAX(sort_order), -1) AS max_order FROM branches WHERE topic_id = ? AND (parent_id = ? OR (parent_id IS NULL AND ? IS NULL))',
        [topic_id, parentVal, parentVal]
      );
      const nextSortOrder = maxResult[0].max_order + 1;
      
      const [result] = await connection.query(
        'INSERT INTO branches (topic_id, parent_id, title, description, sort_order) VALUES (?, ?, ?, ?, ?)',
        [topic_id, parentVal, title.trim(), '', nextSortOrder]
      );
      
      const newId = result.insertId;
      tempIdToDbId[tempId] = newId;
      
      createdBranches.push({
        id: newId,
        topic_id,
        parent_id: parentVal,
        title: title.trim(),
        description: '',
        is_expanded: true,
        sort_order: nextSortOrder
      });
    }
    
    await connection.commit();
    res.status(201).json(createdBranches);
  } catch (error) {
    await connection.rollback();
    console.error('Error during bulk branch creation:', error);
    res.status(500).json({ error: error.message || 'Failed to create branches in bulk' });
  } finally {
    connection.release();
  }
});


// 7. UPDATE BRANCH
app.put('/api/branches/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  const { title, description, is_expanded, sort_order, parent_id } = req.body;
  
  try {
    // Fetch current state
    const [currentRows] = await pool.query('SELECT * FROM branches WHERE id = ?', [id]);
    if (currentRows.length === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    const current = currentRows[0];
    
    // Prepare updated fields
    const updatedTitle = title !== undefined ? title.trim() : current.title;
    const updatedDescription = description !== undefined ? description : current.description;
    const updatedIsExpanded = is_expanded !== undefined ? (is_expanded ? 1 : 0) : current.is_expanded;
    const updatedSortOrder = sort_order !== undefined ? sort_order : current.sort_order;
    const updatedParentId = parent_id !== undefined ? parent_id : current.parent_id;

    if (updatedTitle === '') {
      return res.status(400).json({ error: 'Title cannot be empty' });
    }

    await pool.query(
      'UPDATE branches SET title = ?, description = ?, is_expanded = ?, sort_order = ?, parent_id = ? WHERE id = ?',
      [updatedTitle, updatedDescription, updatedIsExpanded, updatedSortOrder, updatedParentId, id]
    );

    res.json({
      id: Number(id),
      topic_id: current.topic_id,
      parent_id: updatedParentId,
      title: updatedTitle,
      description: updatedDescription,
      is_expanded: !!updatedIsExpanded,
      sort_order: updatedSortOrder
    });
  } catch (error) {
    console.error('Error updating branch:', error);
    res.status(500).json({ error: 'Failed to update branch' });
  }
});

// 8. DELETE BRANCH
app.delete('/api/branches/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  try {
    const [result] = await pool.query('DELETE FROM branches WHERE id = ?', [id]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Branch not found' });
    }
    res.json({ message: 'Branch and its subnodes deleted successfully', id: Number(id) });
  } catch (error) {
    console.error('Error deleting branch:', error);
    res.status(500).json({ error: 'Failed to delete branch' });
  }
});

// Handle serving the frontend fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start Server
app.listen(PORT, async () => {
  console.log(`[Server] Topic Branching App is running on http://localhost:${PORT}`);
  await connectDatabase();
});
