const express = require('express');
const morgan = require('morgan');
const userRouter = require('./routes/user.routes');
const productRouter = require('./routes/product.routes');
const orderRouter = require('./routes/order.routes');
const cartRouter = require('./routes/cart.routes');
const reviewRouter = require('./routes/review.routes');
const cookieParser = require('cookie-parser');
const AppError = require('./utils/appError');
const globalErrorHandler = require('./controllers/error.controller');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());
// Middleware
app.use(morgan('dev'));
app.use((req, res, next) => {
  req.requestTime = new Date().toISOString();
  next();
});

//Routes
app.use('/api/v1/users', userRouter);
app.use('/api/v1/products', productRouter);
app.use('/api/v1/cart', cartRouter);
app.use('/api/v1/orders', orderRouter);
app.use('/api/v1/reviews', reviewRouter);
app.all('*', (req, res, next) => {
  next(new AppError(`Can not find ${req.originalUrl} on this server`));
});
app.use(globalErrorHandler);

//chat
const httpServer = http.Server(app);
const io = new Server(httpServer, { cors: { origin: '*' } });
const users = [];

io.on('connection', (socket) => {
  console.log('connection', socket.id);
  socket.on('disconnect', () => {
    const user = users.find((x) => x.socketId === socket.id);
    if (user) {
      user.online = false;
      console.log('Offline', user.name);
      const admin = users.find((x) => x.restrictTo('admin') && x.online);
      if (admin) {
        io.to(admin.socketId).emit('updateUser', user);
      }
    }
  });
  socket.on('onLogin', (user) => {
    const updatedUser = {
      ...user,
      online: true,
      socketId: socket.id,
      messages: [],
    };
    const existUser = users.find((x) => x._id === updatedUser._id);
    if (existUser) {
      existUser.socketId = socket.id;
      existUser.online = true;
    } else {
      users.push(updatedUser);
    }
    console.log('Online', user.name);
    const admin = users.find((x) => x.restrictTo('admin') && x.online);
    if (admin) {
      io.to(admin.socketId).emit('updateUser', updatedUser);
    }
    if (updatedUser.isAdmin) {
      io.to(updatedUser.socketId).emit('listUsers', users);
    }
  });

  socket.on('onUserSelected', (user) => {
    const admin = users.find((x) =>  x.restrictTo('admin') && x.online);
    if (admin) {
      const existUser = users.find((x) => x._id === user._id);
      io.to(admin.socketId).emit('selectUser', existUser);
    }
  });

  socket.on('onMessage', (message) => {
    if (message.restrictTo('admin')) {
      const user = users.find((x) => x._id === message._id && x.online);
      if (user) {
        io.to(user.socketId).emit('message', message);
        user.messages.push(message);
      }
    } else {
      const admin = users.find((x) => x.restrictTo('admin') && x.online);
      if (admin) {
        io.to(admin.socketId).emit('message', message);
        const user = users.find((x) => x._id === message._id && x.online);
        user.messages.push(message);
      } else {
        io.to(socket.id).emit('message', {
          name: 'Admin',
          body: 'Sorry. I am not online right now',
        });
      }
    }
  });
});

module.exports = app;
