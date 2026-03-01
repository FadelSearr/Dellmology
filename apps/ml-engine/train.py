import tensorflow as tf
import numpy as np
import os
import logging
import argparse
import time
import json

from model import StockCNN

# --- Configuration ---
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Data and Model paths
DATA_DIR = "apps/ml-engine/processed_data"
CHECKPOINT_DIR = "apps/ml-engine/checkpoints"
MODEL_NAME = "stock_model.ckpt"

# Training Parameters
BATCH_SIZE = 128
TRAINING_STEPS = 200000
TEST_SPLIT = 0.2 # 20% of data for testing
DROPOUT_PROB = 0.5

# --- Main Execution ---

def load_data(symbol: str):
    """Loads the processed feature and label files for a given symbol."""
    logging.info(f"Loading data for symbol {symbol} from {DATA_DIR}...")
    try:
        features_path = os.path.join(DATA_DIR, f"{symbol}_features.npy")
        labels_path = os.path.join(DATA_DIR, f"{symbol}_labels.npy")
        
        features = np.load(features_path)
        labels = np.load(labels_path)
        
        logging.info(f"Features shape: {features.shape}")
        logging.info(f"Labels shape: {labels.shape}")
        
        return features, labels
    except FileNotFoundError:
        logging.fatal(f"FATAL: Data files not found. Please run 'feature_generator.py' first.")
        return None, None

def split_data(features, labels):
    """Splits data into training and testing sets."""
    split_idx = int(len(features) * (1 - TEST_SPLIT))
    
    x_train = features[:split_idx]
    y_train = labels[:split_idx]
    
    x_test = features[split_idx:]
    y_test = labels[split_idx:]
    
    logging.info(f"Training set size: {len(x_train)}")
    logging.info(f"Testing set size: {len(x_test)}")
    
    return x_train, y_train, x_test, y_test

def get_next_batch(features, labels, index, batch_size):
    """A simple utility to get the next batch of data."""
    start = index
    end = index + batch_size
    if end > len(features):
        return None, None, 0 # End of epoch
    return features[start:end], labels[start:end], end

def main(symbol: str):
    # set symbol global for data paths
    logging.info(f"Training symbol: {symbol}")
    # 1. Load and prepare data
    features, labels = load_data(symbol)
    if features is None:
        return
    
    x_train, y_train, x_test, y_test = split_data(features, labels)
    
    # 2. Define TensorFlow graph
    # Input shapes from the model reference
    image_shape = [None, 128, 5] 
    label_shape = [None, 2]
    
    image_ph = tf.placeholder(tf.float32, image_shape, name="input_image")
    label_ph = tf.placeholder(tf.float32, label_shape, name="input_label")
    dropout_ph = tf.placeholder(tf.float32, name="dropout_prob")

    # 3. Instantiate the Model
    model = StockCNN(image_ph, label_ph, dropout_prob=dropout_ph)
    
    # 4. Create a saver to store the trained model
    saver = tf.train.Saver()
    os.makedirs(CHECKPOINT_DIR, exist_ok=True)
    
    # 5. Start the training session
    config = tf.ConfigProto()
    config.gpu_options.allow_growth = True # Allow GPU memory to grow if needed
    
    start_time = time.time()
    with tf.Session(config=config) as sess:
        sess.run(tf.global_variables_initializer())
        logging.info("Starting model training...")
        
        batch_index = 0
        # track running loss
        running_losses = []
        for i in range(TRAINING_STEPS):
            # Get the next batch of training data
            x_batch, y_batch, next_idx = get_next_batch(x_train, y_train, batch_index, BATCH_SIZE)
            
            # If we've reached the end of the epoch, reset
            if x_batch is None:
                batch_index = 0
                continue
            batch_index = next_idx

            # Run the optimization step
            sess.run(model.optimize, {
                image_ph: x_batch,
                label_ph: y_batch,
                dropout_ph: DROPOUT_PROB
            })
            
            # Periodically evaluate accuracy and save the model
            if i % 1000 == 0:
                # Evaluate on a batch of test data
                accuracy = sess.run(model.accuracy, {
                    image_ph: x_test, 
                    label_ph: y_test,
                    dropout_ph: 1.0 # No dropout during testing
                })
                # compute loss as well
                loss_val = sess.run(tf.reduce_mean(tf.nn.softmax_cross_entropy_with_logits_v2(labels=label_ph, logits=model.prediction)), {
                    image_ph: x_test,
                    label_ph: y_test,
                    dropout_ph: 1.0
                })
                logging.info(f"Step {i}, Test Accuracy: {accuracy:.4f}, Loss: {loss_val:.6f}")
                # append to history
                running_losses.append({'step': i, 'accuracy': float(accuracy), 'loss': float(loss_val), 'timestamp': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime())})
                
                # Save checkpoint
                save_path = saver.save(sess, os.path.join(CHECKPOINT_DIR, MODEL_NAME), global_step=i)
                logging.info(f"Model saved to {save_path}")

        # Final accuracy evaluation
        final_accuracy = sess.run(model.accuracy, {
            image_ph: x_test,
            label_ph: y_test,
            dropout_ph: 1.0
        })
        logging.info(f"Final accuracy on testing set: {final_accuracy:.4f}")

        # compute final loss on test set
        logits = sess.run(model.prediction, {image_ph: x_test, dropout_ph: 1.0})
        loss_tensor = tf.reduce_mean(tf.nn.softmax_cross_entropy_with_logits_v2(labels=label_ph, logits=model.prediction))
        final_loss = sess.run(loss_tensor, {image_ph: x_test, label_ph: y_test, dropout_ph: 1.0})

    elapsed = time.time() - start_time

    # determine model size (sum of checkpoint files with prefix)
    try:
        prefix = os.path.join(CHECKPOINT_DIR, MODEL_NAME)
        # TensorFlow appends global_step; find latest matching files
        files = [os.path.join(CHECKPOINT_DIR, f) for f in os.listdir(CHECKPOINT_DIR) if f.startswith(os.path.basename(MODEL_NAME))]
        total_bytes = 0
        for f in files:
            try:
                total_bytes += os.path.getsize(f)
            except Exception:
                pass
        model_size_mb = total_bytes / (1024 * 1024)
    except Exception:
        model_size_mb = 0.0

    logging.info("Training finished.")

    # print JSON metrics to stdout for scheduler to consume (include history)
    metrics = {
        'symbol': symbol,
        'trained_at': time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
        'training_loss': float(final_loss) if final_loss is not None else None,
        'validation_accuracy': float(final_accuracy) if final_accuracy is not None else None,
        'training_time_seconds': int(elapsed),
        'model_size_mb': round(float(model_size_mb), 3),
        'history': running_losses
    }
    print(json.dumps({'training_metrics': metrics}))
    # flush
    try:
        import sys
        sys.stdout.flush()
    except Exception:
        pass

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Train CNN model for a symbol')
    parser.add_argument('symbol', help='Stock symbol to train (e.g., BBCA)')
    parser.add_argument('--steps', type=int, default=200000, help='Number of training steps')
    parser.add_argument('--real', action='store_true', help='Run real training (flag for compatibility)')
    args = parser.parse_args()
    TRAINING_STEPS = args.steps
    main(args.symbol)
