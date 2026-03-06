#!/usr/bin/env python3
"""Train a tiny toy CNN if TensorFlow is installed; otherwise write a JSON stub model.

Writes either `toy_cnn.h5` (when TF available) or `toy_cnn_stub.json` next to this script.
Usage:
    python train_or_stub.py --epochs 3 --samples 128
"""
import json
import os
import argparse
import numpy as np

parser = argparse.ArgumentParser()
parser.add_argument('--output-dir', default='.', help='Directory to write model/stub')
parser.add_argument('--epochs', type=int, default=3, help='Training epochs (if TF present)')
parser.add_argument('--samples', type=int, default=128, help='Number of random samples for toy training')
args = parser.parse_args()

out_dir = os.path.abspath(args.output_dir)
if not os.path.isdir(out_dir):
    os.makedirs(out_dir, exist_ok=True)

stub_path = os.path.join(out_dir, 'toy_cnn_stub.json')
h5_path = os.path.join(out_dir, 'toy_cnn.h5')

# try to import tensorflow
try:
    import tensorflow as tf
    from tensorflow import keras
    tf_available = True
except Exception as e:
    tf_available = False

if tf_available:
    print('TensorFlow detected — training small model (this may take time)')
    # build tiny cnn
    input_shape = (16, 16, 1)
    num_classes = 2
    model = keras.Sequential([
        keras.layers.Input(shape=input_shape),
        keras.layers.Conv2D(8, (3,3), activation='relu'),
        keras.layers.MaxPool2D((2,2)),
        keras.layers.Flatten(),
        keras.layers.Dense(32, activation='relu'),
        keras.layers.Dense(num_classes, activation='softmax')
    ])
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy')

    # random data
    X = np.random.rand(args.samples, input_shape[0], input_shape[1], input_shape[2]).astype('float32')
    y = np.random.randint(0, num_classes, size=(args.samples,))

    model.fit(X, y, epochs=args.epochs, batch_size=16, verbose=2)
    model.save(h5_path)
    print('Saved toy model to', h5_path)
    # also write a stub for compatibility
    sample_preds = model.predict(X[:2]).tolist()
    stub = {'input_shape': list(input_shape), 'predictions': sample_preds}
    with open(stub_path, 'w') as f:
        json.dump(stub, f, indent=2)
    print('Wrote companion stub to', stub_path)
else:
    print('TensorFlow not available — writing JSON stub only')
    # produce uniform predictions
    input_shape = [16, 16, 1]
    preds = [[0.5, 0.5], [0.5, 0.5]]
    stub = {'input_shape': input_shape, 'predictions': preds}
    with open(stub_path, 'w') as f:
        json.dump(stub, f, indent=2)
    print('Wrote stub to', stub_path)

print('Done')
