import mongoose from 'mongoose';
import { HEX_COLOR_REGEX } from '../constants/regex.js';

const labelSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
      index: true,
    },

    name: {
      type: String,
      required: [true, 'Label name is required'],
      trim: true,
      minlength: [1, 'Label name cannot be empty'],
      maxlength: [50, 'Label name cannot exceed 50 characters'],
    },

    color: {
      type: String,
      required: [true, 'Label color is required'],
      trim: true,
      match: [HEX_COLOR_REGEX, 'Color must be a valid hex color'],
    },
  },
  {
    timestamps: true,
  }
);

/*
 * A label name must be unique within its project.
 * Uniqueness is scoped to the project so two different projects
 * may each have a "Bug" label.
 */
labelSchema.index(
  {
    project: 1,
    name: 1,
  },
  {
    unique: true,
  }
);

// Listing a project's labels in creation order.
labelSchema.index({
  project: 1,
  createdAt: 1,
});

const Label = mongoose.model('Label', labelSchema);

export default Label;
