# quick test to import and instantiate the CNN scaffold
from apps.ml_engine.cnn_model import SimpleCNN

if __name__ == '__main__':
    model = SimpleCNN()
    print('OK:', model.summary())
