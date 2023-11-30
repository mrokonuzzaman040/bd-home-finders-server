const express = require('express');
const app = express();
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const formData = require('form-data');
const Mailgun = require('mailgun.js');
const mailgun = new Mailgun(formData);

const mg = mailgun.client({
    username: 'api',
    key: process.env.MAIL_GUN_API_KEY,
});


const port = process.env.PORT || 5000;

// middleware
app.use(cors());
app.use(express.json());


const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

// const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.swu9d.mongodb.net/?retryWrites=true&w=majority`;
const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.tu0smng.mongodb.net/?retryWrites=true&w=majority`;


// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        // await client.connect();

        const userCollection = client.db(`${process.env.DB_NAME}`).collection("users");
        const propertyCollection = client.db(`${process.env.DB_NAME}`).collection("propertys");
        const wishCollection = client.db(`${process.env.DB_NAME}`).collection("wishlists");
        const reviewCollection = client.db(`${process.env.DB_NAME}`).collection("reviews");
        const offerCollection = client.db(`${process.env.DB_NAME}`).collection("offers");
        const paymentCollection = client.db(`${process.env.DB_NAME}`).collection("payments");
        const adsCollection = client.db(`${process.env.DB_NAME}`).collection("ads");


        // jwt related api
        app.post('/jwt', async (req, res) => {
            const user = req.body;
            const token = jwt.sign(user, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1h' });
            res.send({ token });
        })

        // middlewares 
        const verifyToken = (req, res, next) => {
            // console.log('inside verify token', req.headers.authorization);
            if (!req.headers.authorization) {
                return res.status(401).send({ message: 'unauthorized access' });
            }
            const token = req.headers.authorization.split(' ')[1];
            jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
                if (err) {
                    return res.status(401).send({ message: 'unauthorized access' })
                }
                req.decoded = decoded;
                next();
            })
        }

        // use verify admin after verifyToken
        const verifyAdmin = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAdmin = user?.role === 'admin';
            if (!isAdmin) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        const verifyAgent = async (req, res, next) => {
            const email = req.decoded.email;
            const query = { email: email };
            const user = await userCollection.findOne(query);
            const isAgent = user?.role === 'agent';
            if (!isAgent) {
                return res.status(403).send({ message: 'forbidden access' });
            }
            next();
        }

        // users related api
        app.get('/users', verifyToken, verifyAdmin, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        });

        app.get('/users/admin/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let admin = false;
            if (user) {
                admin = user?.role === 'admin';
            }
            res.send({ admin });
        })

        app.get('/users/agent/:email', verifyToken, async (req, res) => {
            const email = req.params.email;

            if (email !== req.decoded.email) {
                return res.status(403).send({ message: 'forbidden access' })
            }

            const query = { email: email };
            const user = await userCollection.findOne(query);
            let agent = false;
            if (user) {
                agent = user?.role === 'agent';
            }
            res.send({ agent });
        })

        app.post('/users', async (req, res) => {
            const user = req.body;
            // insert email if user doesnt exists: 
            // you can do this many ways (1. email unique, 2. upsert 3. simple checking)
            const query = { email: user.email }
            const existingUser = await userCollection.findOne(query);
            if (existingUser) {
                return res.send({ message: 'user already exists', insertedId: null })
            }
            const result = await userCollection.insertOne(user);
            res.send(result);
        });

        app.patch('/users/admin/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) };
            const updatedDoc = {
                $set: {
                    role: 'admin'
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc);
            res.send(result);
        })

        app.patch('/users/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    role: req.body.role,
                }
            }
            const result = await userCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.delete('/users/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await userCollection.deleteOne(query);
            res.send(result);
        })

        // ================== Property related api ==================
        app.get('/propertys', async (req, res) => {
            const result = await propertyCollection.find().toArray();
            res.send(result);
        });

        app.get('/propertys/v1', async (req, res) => {
            const result = await propertyCollection.find().toArray();
            const slicedResult = result.slice(0, 4); // Slice the first 4 items
            res.send(slicedResult);
        });

        // API only get verified propertys
        app.get('/propertys/verified', async (req, res) => {
            const query = { home_status: 'Verified' };
            const result = await propertyCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/propertys/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await propertyCollection.findOne(query);
            res.send(result);
        })

        app.patch('/propertys/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_name: req.body.home_name,
                    home_location: req.body.home_location,
                    home_description: req.body.home_description,
                    home_starting_price: req.body.home_starting_price,
                    home_ending_price: req.body.home_ending_price,
                    home_type: req.body.home_type,
                    home_area: req.body.home_area,
                    home_bed: req.body.home_bed,
                    home_bath: req.body.home_bath,
                    home_garage: req.body.home_garage,
                    home_size: req.body.home_size,
                    home_status: req.body.home_status,
                    home_agent: req.body.home_agent,
                    home_photo: req.body.home_photo,

                    home_owner_name: req.body.home_owner,
                    home_owner_email: req.body.home_owner_email,
                    home_owner_phone: req.body.home_owner_phone,
                    home_user_photo: req.body.home_user_photo,
                }
            }

            const result = await propertyCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.delete('/propertys/:id', verifyToken, verifyAdmin, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await propertyCollection.deleteOne(query);
            res.send(result);
        })


        app.post('/propertys', verifyToken, verifyAdmin, async (req, res) => {
            const item = req.body;
            const result = await propertyCollection.insertOne(item);
            res.send(result);
        });

        // ================== Property related api ==================

        // ----------------- Agent related apis -----------------
        // API only get verified propertys

        app.patch('/propertys/reupdate/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_name: req.body.home_name,
                    home_location: req.body.home_location,
                    home_starting_price: req.body.home_starting_price,
                    home_ending_price: req.body.home_ending_price,
                    home_status: req.body.home_status,
                }
            }

            const result = await propertyCollection.updateOne(filter, updatedDoc)
            res.send(result);
        });

        app.get('/propertys/agent/:email', async (req, res) => {
            const email = req.params.email;
            const query = { home_owner_email: email }
            const result = await propertyCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/propertys/agent', async (req, res) => {
            const item = req.body;
            const result = await propertyCollection.insertOne(item);
            res.send(result);
        });

        app.get('/propertys/agent/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await propertyCollection.findOne(query);
            res.send(result);
        })

        app.delete('/propertys/agent/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await propertyCollection.deleteOne(query);
            res.send(result);
        })

        // ----------------- Agent related apis -----------------
        // API only get verified propertys




        // ----------------- offer_request related apis -----------------
        app.get('/offer_requests', async (req, res) => {
            const result = await offerCollection.find().toArray();
            res.send(result);
        });

        app.get('/offer_requests/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await offerCollection.findOne(query);
            res.send(result);
        })

        app.get('/offer_requests/agent/:email', async (req, res) => {
            const email = req.params.email;
            const query = { home_owner_email: email }
            const result = await offerCollection.find(query).toArray();
            res.send(result);
        })

        app.get('/offer_requests/user/:email', async (req, res) => {
            const email = req.params.email;
            const query = { buyer_email: email }
            const result = await offerCollection.find(query).toArray();
            res.send(result);
        })

        app.post('/offer_requests', async (req, res) => {
            const item = req.body;
            const result = await offerCollection.insertOne(item);
            res.send(result);
        });

        app.delete('/offer_requests/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await offerCollection.deleteOne(query);
            res.send(result);
        })

        app.patch('/offer_requests/:id', verifyToken, verifyAgent, async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_status: req.body.home_status,
                }
            }

            const result = await offerCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })
        // Update status after payment
        app.patch('/offer_requests/afterPayement/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_status: req.body.home_status,
                }
            }

            const result = await offerCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        app.patch('/offer_requests/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_name: req.body.home_name,
                    home_location: req.body.home_location,
                    home_description: req.body.home_description,
                    home_starting_price: req.body.home_starting_price,
                    home_ending_price: req.body.home_ending_price,
                    home_type: req.body.home_type,
                    home_area: req.body.home_area,
                    home_bed: req.body.home_bed,
                    home_bath: req.body.home_bath,
                    home_garage: req.body.home_garage,
                    home_size: req.body.home_size,
                    home_status: req.body.home_status,
                    home_agent: req.body.home_agent,
                    home_photo: req.body.home_photo,

                    home_owner_name: req.body.home_owner,
                    home_owner_email: req.body.home_owner_email,
                    home_owner_phone: req.body.home_owner_phone,
                    home_user_photo: req.body.home_user_photo,
                }
            }

            const result = await offerCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })



        app.patch('/status/:id', async (req, res) => {
            const id = req.params.id;
            const filter = { _id: new ObjectId(id) }
            const updatedDoc = {
                $set: {
                    home_status: req.body.home_status,
                }
            }

            const result = await propertyCollection.updateOne(filter, updatedDoc)
            res.send(result);
        })

        // reviews collection
        app.get('/reviews', async (req, res) => {
            const result = await reviewCollection.find().toArray();
            res.send(result);
        });

        app.post('/reviews', async (req, res) => {
            const review = req.body;
            console.log(review);
            const result = await reviewCollection.insertOne(review);
            res.send(result);
        });

        app.delete('/reviews/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await reviewCollection.deleteOne(query);
            res.send(result);
        });


        app.get('/reviews/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await reviewCollection.find(query).toArray();
            res.send(result);
        });

        // carts collection
        app.get('/wishlist', async (req, res) => {
            const email = req.query.email;
            const query = { email: email };
            const result = await wishCollection.find(query).toArray();
            res.send(result);
        });

        app.get('/wishlist/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await wishCollection.findOne(query);
            res.send(result);
        });

        app.post('/wishlist', async (req, res) => {
            const cartItem = req.body;
            const result = await wishCollection.insertOne(cartItem);
            res.send(result);
        });

        app.delete('/wishlist/:id', async (req, res) => {
            const id = req.params.id;
            const query = { _id: new ObjectId(id) }
            const result = await wishCollection.deleteOne(query);
            res.send(result);
        });


        // ----------------- Payment related apis -----------------
        app.post('/create-payment-intent', async (req, res) => {
            const { price } = req.body;
            const amount = parseInt(price * 100);

            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: "usd",
                payment_method_types: ["card"],
            });
            res.send({
                clientSecret: paymentIntent.client_secret
            })
        })

        app.get('/payments/:email', async (req, res) => {
            const email = req.params.email;
            const query = { email: email };
            const result = await paymentCollection.find(query).toArray();
            res.send(result);
        })


        app.post('/payments', async (req, res) => {
            const payment = req.body;
            const paymentResult = await paymentCollection.insertOne(payment);
            const query = {
                _id: new ObjectId(payment.propertyId)
            };

            const deleteResult = await offerCollection.deleteOne(query);
            res.send({ paymentResult, deleteResult });
        })
    } finally {
    }
}
run().catch(console.dir);


app.get('/', (req, res) => {
    res.send('bdHomeFinders is sitting')
})

app.listen(port, () => {
    console.log(`bdHomeFinders is sitting on port ${port}`);
})
