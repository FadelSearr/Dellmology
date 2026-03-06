"""Train and save a tiny CNN locally for Fase 5 development.

Usage:
  python train_toy_model.py

If TensorFlow is not installed the script will exit with a helpful message.
"""
import os
import numpy as np

try:
    import tensorflow as tf
    from tensorflow import keras
except Exception as e:
    print("TensorFlow not available. To train a model, install TensorFlow:")
    print("pip install tensorflow")
    raise SystemExit(1)

MODEL_DIR = os.path.join(os.path.dirname(__file__), 'saved_model')


def build_model(input_shape=(16, 16, 1)):
    inputs = keras.Input(shape=input_shape)
    x = keras.layers.Rescaling(1.0 / 255)(inputs)
    x = keras.layers.Conv2D(8, 3, activation='relu')(x)
    x = keras.layers.MaxPool2D(2)(x)
    x = keras.layers.Flatten()(x)
    x = keras.layers.Dense(8, activation='relu')(x)
    outputs = keras.layers.Dense(2, activation='softmax')(x)
    model = keras.Model(inputs, outputs)
    model.compile(optimizer='adam', loss='sparse_categorical_crossentropy', metrics=['accuracy'])
    return model


def make_dummy_dataset(num_samples=128, input_shape=(16, 16, 1)):
    X = np.random.rand(num_samples, *input_shape).astype('float32')
    y = np.random.randint(0, 2, size=(num_samples,))
    return X, y


def main():
    print('Building model...')
    model = build_model()
    X, y = make_dummy_dataset()
    print('Training for 3 epochs on dummy data...')
    model.fit(X, y, epochs=3, batch_size=16, verbose=1)
    os.makedirs(MODEL_DIR, exist_ok=True)
    save_path = os.path.join(MODEL_DIR, 'toy_cnn.h5')
    model.save(save_path)
    print('Saved toy model to', save_path)


if __name__ == '__main__':
    main()
