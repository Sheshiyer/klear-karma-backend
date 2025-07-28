// Message management routes
import { Hono } from 'hono';
import { WorkerEnv } from '../types/env';
import { requireAuth, requirePractitioner, requireAdmin } from '../middleware/auth';
// import { rateLimiter } from '../middleware/rateLimiter';
import { 
  validateMessage,
  validateQueryParams,
  validateRequired,
  validateUUID,
  sanitizeString,
  cleanObject
} from '../utils/validation';
import { generateSecureRandom } from '../utils/crypto';
import { AppError, NotFoundError, ValidationError, AuthorizationError } from '../middleware/errorHandler';

interface Variables {
  userId?: string;
  userRole?: string;
}

const messages = new Hono<{ Bindings: WorkerEnv; Variables: Variables }>();

// Send a new message
messages.post('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  const body = await c.req.json();
  
  const validatedMessage = validateMessage(body);
  
  // Validate recipient exists
  let recipientData;
  if (userRole === 'practitioner') {
    // Practitioner sending to user
    const user = await c.env.USERS_KV.get(`user:${validatedMessage.recipientId}`);
    if (!user) {
      throw new NotFoundError('Recipient user not found');
    }
    recipientData = JSON.parse(user);
  } else {
    // User sending to practitioner
    const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${validatedMessage.recipientId}`);
    if (!practitioner) {
      throw new NotFoundError('Recipient practitioner not found');
    }
    recipientData = JSON.parse(practitioner);
    
    if (recipientData.status !== 'active') {
      throw new ValidationError('Cannot send message to inactive practitioner');
    }
  }
  
  // Get sender data
  let senderData;
  if (userRole === 'practitioner') {
    const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${userId}`);
    senderData = JSON.parse(practitioner!);
  } else {
    const user = await c.env.USERS_KV.get(`user:${userId}`);
    senderData = JSON.parse(user!);
  }
  
  // Create message
  const messageId = generateSecureRandom(16);
  const message = {
    id: messageId,
    senderId: userId,
    senderName: senderData.fullName,
    senderRole: userRole,
    recipientId: validatedMessage.recipientId,
    recipientName: recipientData.fullName,
    recipientRole: userRole === 'practitioner' ? 'user' : 'practitioner',
    subject: validatedMessage.subject,
    content: sanitizeString(validatedMessage.content),
    type: validatedMessage.type || 'general',
    appointmentId: validatedMessage.appointmentId || null,
    priority: validatedMessage.priority || 'normal',
    status: 'sent',
    readAt: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  // If message is related to an appointment, validate it exists and user has access
  if (validatedMessage.appointmentId) {
    const appointment = await c.env.APPOINTMENTS_KV.get(`appointment:${validatedMessage.appointmentId}`);
    if (!appointment) {
      throw new NotFoundError('Related appointment not found');
    }
    
    const appointmentData = JSON.parse(appointment);
    if (appointmentData.customerId !== userId && 
        appointmentData.practitionerId !== userId &&
        appointmentData.customerId !== validatedMessage.recipientId &&
        appointmentData.practitionerId !== validatedMessage.recipientId) {
      throw new AuthorizationError('No access to the related appointment');
    }
  }
  
  // Create conversation ID for threading
  const conversationId = [userId, validatedMessage.recipientId].sort().join('-');
  message.conversationId = conversationId;
  
  // Store message with multiple keys for efficient querying
  await Promise.all([
    c.env.MESSAGES_KV.put(`message:${messageId}`, JSON.stringify(message)),
    c.env.MESSAGES_KV.put(`user_messages:${userId}:${messageId}`, JSON.stringify(message)),
    c.env.MESSAGES_KV.put(`user_messages:${validatedMessage.recipientId}:${messageId}`, JSON.stringify(message)),
    c.env.MESSAGES_KV.put(`conversation:${conversationId}:${messageId}`, JSON.stringify(message))
  ]);
  
  // Update conversation metadata
  const conversationMeta = {
    id: conversationId,
    participants: [userId, validatedMessage.recipientId],
    lastMessageId: messageId,
    lastMessageAt: new Date().toISOString(),
    lastMessageBy: userId,
    messageCount: 1,
    unreadCount: {
      [userId]: 0,
      [validatedMessage.recipientId]: 1
    }
  };
  
  // Check if conversation already exists
  const existingConversation = await c.env.MESSAGES_KV.get(`conversation_meta:${conversationId}`);
  if (existingConversation) {
    const existing = JSON.parse(existingConversation);
    conversationMeta.messageCount = existing.messageCount + 1;
    conversationMeta.unreadCount = {
      ...existing.unreadCount,
      [validatedMessage.recipientId]: (existing.unreadCount[validatedMessage.recipientId] || 0) + 1
    };
  }
  
  await c.env.MESSAGES_KV.put(`conversation_meta:${conversationId}`, JSON.stringify(conversationMeta));
  
  return c.json({
    success: true,
    message: 'Message sent successfully',
    data: message
  }, 201);
});

// Get message by ID
messages.get('/:id', requireAuth, async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  
  const message = await c.env.MESSAGES_KV.get(`message:${messageId}`);
  if (!message) {
    throw new NotFoundError('Message not found');
  }
  
  const messageData = JSON.parse(message);
  
  // Check authorization
  if (userRole !== 'admin' && 
      messageData.senderId !== userId && 
      messageData.recipientId !== userId) {
    throw new AuthorizationError('Access denied');
  }
  
  // Mark as read if user is the recipient
  if (messageData.recipientId === userId && !messageData.readAt) {
    messageData.readAt = new Date().toISOString();
    messageData.status = 'read';
    
    // Update message
    await Promise.all([
      c.env.MESSAGES_KV.put(`message:${messageId}`, JSON.stringify(messageData)),
      c.env.MESSAGES_KV.put(`user_messages:${messageData.senderId}:${messageId}`, JSON.stringify(messageData)),
      c.env.MESSAGES_KV.put(`user_messages:${messageData.recipientId}:${messageId}`, JSON.stringify(messageData)),
      c.env.MESSAGES_KV.put(`conversation:${messageData.conversationId}:${messageId}`, JSON.stringify(messageData))
    ]);
    
    // Update conversation unread count
    const conversationMeta = await c.env.MESSAGES_KV.get(`conversation_meta:${messageData.conversationId}`);
    if (conversationMeta) {
      const meta = JSON.parse(conversationMeta);
      meta.unreadCount[userId] = Math.max(0, (meta.unreadCount[userId] || 0) - 1);
      await c.env.MESSAGES_KV.put(`conversation_meta:${messageData.conversationId}`, JSON.stringify(meta));
    }
  }
  
  return c.json({
    success: true,
    data: messageData
  });
});

// Get user's messages
messages.get('/', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { page, limit, type, status, conversationId } = validateQueryParams(c.req.query());
  
  let prefix = `user_messages:${userId}:`;
  
  // If filtering by conversation, use conversation prefix
  if (conversationId) {
    prefix = `conversation:${conversationId}:`;
  }
  
  const messagesList = await c.env.MESSAGES_KV.list({
    prefix,
    limit: 1000
  });
  
  const messages = [];
  
  for (const key of messagesList.keys) {
    const messageData = await c.env.MESSAGES_KV.get(key.name);
    if (messageData) {
      const message = JSON.parse(messageData);
      
      // Apply filters
      let include = true;
      
      if (type && message.type !== type) {
        include = false;
      }
      
      if (status && message.status !== status) {
        include = false;
      }
      
      // If filtering by conversation, ensure user has access
      if (conversationId && 
          message.senderId !== userId && 
          message.recipientId !== userId) {
        include = false;
      }
      
      if (include) {
        messages.push(message);
      }
    }
  }
  
  // Remove duplicates (since we might have multiple keys for same message)
  const uniqueMessages = messages.filter((message, index, self) => 
    index === self.findIndex(m => m.id === message.id)
  );
  
  // Sort by creation date (newest first)
  uniqueMessages.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedMessages = uniqueMessages.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedMessages,
    pagination: {
      page,
      limit,
      total: uniqueMessages.length,
      totalPages: Math.ceil(uniqueMessages.length / limit)
    }
  });
});

// Get user's conversations
messages.get('/conversations', requireAuth, async (c) => {
  const userId = c.get('userId');
  const { page, limit } = validateQueryParams(c.req.query());
  
  // Get all conversation metadata where user is a participant
  const conversationsList = await c.env.MESSAGES_KV.list({
    prefix: 'conversation_meta:',
    limit: 1000
  });
  
  const conversations = [];
  
  for (const key of conversationsList.keys) {
    const conversationData = await c.env.MESSAGES_KV.get(key.name);
    if (conversationData) {
      const conversation = JSON.parse(conversationData);
      
      // Check if user is a participant
      if (conversation.participants.includes(userId)) {
        // Get the other participant's details
        const otherParticipantId = conversation.participants.find((id: string) => id !== userId);
        
        let otherParticipant;
        // Try to get from users first, then practitioners
        const user = await c.env.USERS_KV.get(`user:${otherParticipantId}`);
        if (user) {
          const userData = JSON.parse(user);
          otherParticipant = {
            id: otherParticipantId,
            name: userData.fullName,
            role: 'user',
            avatar: userData.avatar || null
          };
        } else {
          const practitioner = await c.env.PRACTITIONERS_KV.get(`practitioner:${otherParticipantId}`);
          if (practitioner) {
            const practitionerData = JSON.parse(practitioner);
            otherParticipant = {
              id: otherParticipantId,
              name: practitionerData.fullName,
              role: 'practitioner',
              avatar: practitionerData.avatar || null
            };
          }
        }
        
        if (otherParticipant) {
          conversations.push({
            ...conversation,
            otherParticipant,
            unreadCount: conversation.unreadCount[userId] || 0
          });
        }
      }
    }
  }
  
  // Sort by last message date (newest first)
  conversations.sort((a, b) => 
    new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedConversations = conversations.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedConversations,
    pagination: {
      page,
      limit,
      total: conversations.length,
      totalPages: Math.ceil(conversations.length / limit)
    }
  });
});

// Mark conversation as read
messages.put('/conversations/:conversationId/read', requireAuth, async (c) => {
  const conversationId = c.req.param('conversationId');
  const userId = c.get('userId');
  
  // Validate conversation exists and user has access
  const conversationMeta = await c.env.MESSAGES_KV.get(`conversation_meta:${conversationId}`);
  if (!conversationMeta) {
    throw new NotFoundError('Conversation not found');
  }
  
  const meta = JSON.parse(conversationMeta);
  if (!meta.participants.includes(userId)) {
    throw new AuthorizationError('Access denied');
  }
  
  // Get all unread messages in conversation
  const messagesList = await c.env.MESSAGES_KV.list({
    prefix: `conversation:${conversationId}:`,
    limit: 1000
  });
  
  const updatePromises = [];
  let markedCount = 0;
  
  for (const key of messagesList.keys) {
    const messageData = await c.env.MESSAGES_KV.get(key.name);
    if (messageData) {
      const message = JSON.parse(messageData);
      
      // Mark as read if user is recipient and message is unread
      if (message.recipientId === userId && !message.readAt) {
        message.readAt = new Date().toISOString();
        message.status = 'read';
        markedCount++;
        
        updatePromises.push(
          c.env.MESSAGES_KV.put(`message:${message.id}`, JSON.stringify(message)),
          c.env.MESSAGES_KV.put(`user_messages:${message.senderId}:${message.id}`, JSON.stringify(message)),
          c.env.MESSAGES_KV.put(`user_messages:${message.recipientId}:${message.id}`, JSON.stringify(message)),
          c.env.MESSAGES_KV.put(`conversation:${conversationId}:${message.id}`, JSON.stringify(message))
        );
      }
    }
  }
  
  // Update conversation unread count
  meta.unreadCount[userId] = 0;
  updatePromises.push(
    c.env.MESSAGES_KV.put(`conversation_meta:${conversationId}`, JSON.stringify(meta))
  );
  
  await Promise.all(updatePromises);
  
  return c.json({
    success: true,
    message: `Marked ${markedCount} messages as read`,
    data: { markedCount }
  });
});

// Delete message (soft delete)
messages.delete('/:id', requireAuth, async (c) => {
  const messageId = c.req.param('id');
  const userId = c.get('userId');
  const userRole = c.get('userRole');
  
  const message = await c.env.MESSAGES_KV.get(`message:${messageId}`);
  if (!message) {
    throw new NotFoundError('Message not found');
  }
  
  const messageData = JSON.parse(message);
  
  // Check authorization - only sender or admin can delete
  if (userRole !== 'admin' && messageData.senderId !== userId) {
    throw new AuthorizationError('Only the sender can delete this message');
  }
  
  // Soft delete - mark as deleted
  const updatedMessage = {
    ...messageData,
    status: 'deleted',
    deletedAt: new Date().toISOString(),
    deletedBy: userId,
    updatedAt: new Date().toISOString()
  };
  
  // Update all message keys
  await Promise.all([
    c.env.MESSAGES_KV.put(`message:${messageId}`, JSON.stringify(updatedMessage)),
    c.env.MESSAGES_KV.put(`user_messages:${messageData.senderId}:${messageId}`, JSON.stringify(updatedMessage)),
    c.env.MESSAGES_KV.put(`user_messages:${messageData.recipientId}:${messageId}`, JSON.stringify(updatedMessage)),
    c.env.MESSAGES_KV.put(`conversation:${messageData.conversationId}:${messageId}`, JSON.stringify(updatedMessage))
  ]);
  
  return c.json({
    success: true,
    message: 'Message deleted successfully'
  });
});

// Get all messages (admin only)
messages.get('/admin/all', requireAdmin, async (c) => {
  const { page, limit, type, status, senderId, recipientId } = validateQueryParams(c.req.query());
  
  const messagesList = await c.env.MESSAGES_KV.list({
    prefix: 'message:',
    limit: 1000
  });
  
  const messages = [];
  
  for (const key of messagesList.keys) {
    const messageData = await c.env.MESSAGES_KV.get(key.name);
    if (messageData) {
      const message = JSON.parse(messageData);
      
      // Apply filters
      let include = true;
      
      if (type && message.type !== type) {
        include = false;
      }
      
      if (status && message.status !== status) {
        include = false;
      }
      
      if (senderId && message.senderId !== senderId) {
        include = false;
      }
      
      if (recipientId && message.recipientId !== recipientId) {
        include = false;
      }
      
      if (include) {
        messages.push(message);
      }
    }
  }
  
  // Sort by creation date (newest first)
  messages.sort((a, b) => 
    new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );
  
  // Paginate
  const startIndex = (page - 1) * limit;
  const paginatedMessages = messages.slice(startIndex, startIndex + limit);
  
  return c.json({
    success: true,
    data: paginatedMessages,
    pagination: {
      page,
      limit,
      total: messages.length,
      totalPages: Math.ceil(messages.length / limit)
    }
  });
});

export default messages;