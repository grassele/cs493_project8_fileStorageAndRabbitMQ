const amqp = require('amqplib');
const rabbitmqHost = process.env.RABBITMQ_HOST;
const rabbitmqUrl = `amqp://${rabbitmqHost}`;


async function main() {
    try {
        console.log('Consumer trying to process image')
        const connection = await amqp.connect(rabbitmqUrl);
        const channel = await connection.createChannel();
        await channel.assertQueue('imageCompression');
        channel.consume(queue, (msg) => {
            if (msg) {
                // image processing here TODO
                console.log(`consumerMain is ready to process the incoming image`);
            }
            channel.ack(msg);
         });
    } catch (err) {
        console.error(err);
    }
  }
  main();