import express from 'express';
import { MongoClient, ObjectId } from 'mongodb';
import dotenv from 'dotenv';
import joi from 'joi'
import cors from 'cors';
import dayjs from 'dayjs'

//Mongo configs 

dotenv.config();
const mongoClient = new MongoClient(process.env.MONGO_URI);
let db;
mongoClient.connect(() => {
  db = mongoClient.db("uol_chat");
});

const app = express();
app.use(cors());
app.use(express.json());


/* Participants Validation */
const participantsSchema = joi.object({
  name: joi.string().required(),
});

/* Messages Validation */

const messagesSchema = joi.object({
  to: joi.string().required(),
  text: joi.string().required(),
  type: joi.string().valid("message","private_message"),
  from: joi.string().required(),
  validUser: joi.required()
});


/* Participants Routes */
app.post('/participants', async (req, res) => {
  
  const participant = req.body;
  const validation = participantsSchema.validate(participant);

  if (validation.error) {
    res.sendStatus(422);
    return;
  }

  try {
    const participants = await db.collection('participants').find().toArray();
    const participantAlreadyExist = participants.some
    ((obj)=>obj.name === participant.name)

    if(participantAlreadyExist){
      res.sendStatus(409);
      return;
    }

    await db.collection('participants').insertOne({...participant, lastStatus: Date.now()})

    const time = dayjs().format('HH:mm:ss')
    const loginMensage = {from: participant.name, to: 'Todos', text: 'entra na sala...', type: 'status', time}
    await db.collection('messages').insertOne(loginMensage)
    
    res.sendStatus(201);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/participants', async (req, res) => {
  try {
    const participants = await db.collection('participants').find().toArray();
    res.send(participants).status(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});


/* Messages Routes */
app.post('/messages', async (req, res) => {
  
  const user = req.headers.user
  const message = req.body;
  const participants = await db.collection('participants').find().toArray();

  const validUser = participants.find((obj)=>obj.name === user)

  const validation = messagesSchema.validate({from:user,...message, validUser});

  if (validation.error) {
    console.log(validation.error.details);
    res.sendStatus(422);
    return;
  }

  try {

    const time = dayjs().format('HH:mm:ss')
    const validatedMessage = {...message,from:user, time}
    await db.collection('messages').insertOne(validatedMessage)
    
    res.sendStatus(201);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

app.get('/messages', async (req, res) => {

  const user = req.headers.user
  const limit = parseInt(req.query.limit);

  try {
    const messages = await db.collection('messages').find().toArray();

    const messagesAllowedToSee = messages.filter(message => {

      const isPrivateAndNotFromUser = message.type === "private_message" && message.from !== user;
      const isPrivateAndNotToUser = message.type === "private_message" && message.to !== user;
      
      console.log(!isPrivateAndNotFromUser && !isPrivateAndNotToUser)
      return (!isPrivateAndNotFromUser || !isPrivateAndNotToUser)
  })

    if(messagesAllowedToSee.length > limit){
      const messagesInLimit = messagesAllowedToSee.slice((messages.length-limit))
      res.send(messagesInLimit).status(200);
      return;
    }

    res.send(messagesAllowedToSee).status(200);

  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});


/* Status Route */
app.post('/status', async (req, res) => {
  
  const user = req.headers.user
  const participants = await db.collection('participants').find().toArray();

  const validUser = participants.find((obj)=>obj.name === user)

  if (!validUser) {
    res.sendStatus(404);
    return;
  }

  try {

    await db.collection('participants').updateOne(
      {name: user}, {$set: {lastStatus: Date.now()} } )

    res.sendStatus(200);
  } catch (error) {
    console.error(error);
    res.sendStatus(500);
  }
});

setInterval(removeInatives, 15000)

async function removeInatives () {


  const participants = await db.collection('participants').find().toArray();
  const dbparticipants = await db.collection('participants');
  const dbMessages = await db.collection('messages');

  /* if user is inative more than 10000 the following lines will identify
     creat a menssage of logout 
     and delete him from "participants" of the chat */
  const TimeToCompare = Date.now() - 10000

    for (let i = 0 ; i < participants.length ; i ++) {
        const participant = participants[i];

        if (participant.lastStatus < TimeToCompare) {
            dbMessages.insertOne({ 
                from: participant.name, 
                to: 'Todos', 
                text: 'sai da sala...', 
                type: 'status', 
                time: dayjs().format("HH:mm:ss") 
            })
        }
    }

  await dbparticipants.deleteMany(
    { lastStatus: { $lte : TimeToCompare}}
    )


}

app.listen(5000, () => {
  console.log('Server is litening on port 5000.');
});
